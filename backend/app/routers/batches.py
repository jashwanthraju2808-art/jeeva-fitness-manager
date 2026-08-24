from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.database.dependencies import get_db
from app.models.batch import Batch
from app.models.user import User
from app.schemas.batch import BatchCreate, BatchResponse
from app.services.audit_service import log_action

router = APIRouter(prefix="/batches", tags=["Batches"])


@router.get("/", response_model=List[BatchResponse])
def get_batches(db: Session = Depends(get_db)):
    return db.query(Batch).order_by(Batch.start_time).all()


@router.post("/", response_model=BatchResponse, status_code=201)
def create_batch(
    batch: BatchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if db.query(Batch).filter(Batch.name == batch.name).first():
        raise HTTPException(status_code=400, detail="Batch name already exists")

    new_batch = Batch(**batch.model_dump())
    db.add(new_batch)

    log_action(
        db,
        username=current_user.username,
        action="CREATE",
        module="Batches",
        description=(
            f"Batch '{batch.name}' ({batch.start_time}–{batch.end_time}) "
            f"created by '{current_user.username}'"
        ),
    )
    db.commit()
    db.refresh(new_batch)
    return new_batch


@router.put("/{batch_id}", response_model=BatchResponse)
def update_batch(
    batch_id: int,
    batch: BatchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(Batch).filter(Batch.id == batch_id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Batch not found")

    old_name = existing.name
    existing.name       = batch.name
    existing.start_time = batch.start_time
    existing.end_time   = batch.end_time

    log_action(
        db,
        username=current_user.username,
        action="UPDATE",
        module="Batches",
        description=(
            f"Batch (id={batch_id}) updated from '{old_name}' to "
            f"'{batch.name}' ({batch.start_time}–{batch.end_time}) "
            f"by '{current_user.username}'"
        ),
    )
    db.commit()
    db.refresh(existing)
    return existing


@router.delete("/{batch_id}")
def delete_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    batch_name = batch.name
    log_action(
        db,
        username=current_user.username,
        action="DELETE",
        module="Batches",
        description=(
            f"Batch '{batch_name}' (id={batch_id}) deleted by '{current_user.username}'"
        ),
    )
    db.delete(batch)
    db.commit()
    return {"message": "Batch deleted"}
