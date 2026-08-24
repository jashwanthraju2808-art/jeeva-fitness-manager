from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import verify_password, create_access_token, get_current_user
from app.database.dependencies import get_db
from app.models.user import User
from app.services.audit_service import log_action

router = APIRouter(prefix="/auth", tags=["Auth"])


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    username: str
    role: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/login", response_model=TokenResponse)
def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(
        User.username == form.username,
        User.is_active == True,  # noqa: E712
    ).first()

    if not user or not verify_password(form.password, user.hashed_password):
        # Log failed login — use username from form (NOT from DB to avoid leaking info)
        log_action(
            db,
            username=form.username,
            action="LOGIN_FAILED",
            module="Auth",
            description=f"Failed login attempt for username '{form.username}'",
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token({"sub": user.username})

    log_action(
        db,
        username=user.username,
        action="LOGIN",
        module="Auth",
        description=f"User '{user.username}' logged in successfully",
    )
    db.commit()

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        username=user.username,
        role=user.role,
    )


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role,
    }


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")

    from app.core.auth import hash_password
    current_user.hashed_password = hash_password(body.new_password)

    # Log — never log the password itself
    log_action(
        db,
        username=current_user.username,
        action="PASSWORD_CHANGE",
        module="Auth",
        description=f"User '{current_user.username}' changed their own password",
    )
    db.commit()
    return {"message": "Password changed successfully"}


class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "staff"


class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool


def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


# ── Duplicate user endpoints kept for backward compatibility ──
# Frontend uses /users/ (users.py). These are secondary.

@router.get("/users", response_model=list[UserResponse])
def get_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return db.query(User).order_by(User.id).all()


@router.post("/users", response_model=UserResponse)
def create_user(
    body: CreateUserRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    username = body.username.strip()

    if not username:
        raise HTTPException(status_code=400, detail="Username is required")

    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    if body.role not in ("admin", "staff"):
        raise HTTPException(status_code=400, detail="Role must be admin or staff")

    existing = db.query(User).filter(User.username == username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    from app.core.auth import hash_password

    user = User(
        username=username,
        hashed_password=hash_password(body.password),
        role=body.role,
        is_active=True,
    )
    db.add(user)

    log_action(
        db,
        username=admin.username,
        action="CREATE",
        module="Users",
        description=f"Admin '{admin.username}' created user '{username}' with role '{body.role}'",
    )
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}/status")
def update_user_status(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")

    user.is_active = not user.is_active
    action_word = "activated" if user.is_active else "deactivated"

    log_action(
        db,
        username=current_user.username,
        action="STATUS_CHANGE",
        module="Users",
        description=f"Admin '{current_user.username}' {action_word} user '{user.username}'",
    )
    db.commit()
    return {"message": "User status updated", "is_active": user.is_active}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    # C3 fix: prevent deleting the last remaining admin (same guard as /users/{id})
    if user.role == "admin":
        admin_count = db.query(User).filter(
            User.role == "admin",
            User.is_active == True,  # noqa: E712
        ).count()
        if admin_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete the last admin account",
            )

    deleted_username = user.username
    db.delete(user)

    log_action(
        db,
        username=current_user.username,
        action="DELETE",
        module="Users",
        description=f"Admin '{current_user.username}' deleted user '{deleted_username}'",
    )
    db.commit()
    return {"message": "User deleted successfully"}
