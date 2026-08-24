"""
Studio settings — logo upload (Cloudinary) and studio info.

Image storage: Cloudinary (persistent CDN — survives Render restarts/redeploys).

Required environment variable:
  CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name

To get this:
  1. Sign up at https://cloudinary.com (free tier: 25 GB)
  2. Dashboard → API Keys → copy the CLOUDINARY_URL string
  3. Add to Render backend environment variables as CLOUDINARY_URL

Fallback: if CLOUDINARY_URL is not set, falls back to local filesystem
(loses files on Render redeploy — only for local development).
"""

import os
import shutil
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, RedirectResponse

from app.core.auth import get_current_user

router = APIRouter(prefix="/studio", tags=["Studio"])

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_TYPES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/svg+xml",
}

MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


def _get_cloudinary_url() -> Optional[str]:
    """Return stored Cloudinary URL from env-persisted setting."""
    # We store the uploaded logo public URL in an env var we set ourselves,
    # or use a simple file-based cache in uploads/logo_url.txt
    url_file = UPLOAD_DIR / "logo_url.txt"
    if url_file.exists():
        return url_file.read_text().strip() or None
    return None


def _set_cloudinary_url(url: str):
    url_file = UPLOAD_DIR / "logo_url.txt"
    url_file.write_text(url)


# ── Upload logo ────────────────────────────────────────────

@router.post("/logo")
async def upload_logo(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    # Validate MIME type
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Only PNG, JPG, WEBP or SVG images are allowed.",
        )

    # Read file contents first (needed for size check + upload)
    contents = await file.read()

    # Validate file size
    if len(contents) > MAX_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail="File too large. Maximum size is 5 MB.",
        )

    cloudinary_url_env = os.getenv("CLOUDINARY_URL", "")

    if cloudinary_url_env:
        # ── Cloudinary upload (persistent) ────────────────
        try:
            import cloudinary
            import cloudinary.uploader

            cloudinary.config(from_url=True)  # reads CLOUDINARY_URL env var

            import io
            result = cloudinary.uploader.upload(
                io.BytesIO(contents),
                public_id="jeeva_fitness_logo",
                overwrite=True,
                resource_type="image",
                folder="jeeva_fitness",
            )
            logo_url = result.get("secure_url", "")
            if not logo_url:
                raise ValueError("Cloudinary returned no URL")

            _set_cloudinary_url(logo_url)

            return {
                "message": "Logo uploaded successfully to Cloudinary",
                "url": logo_url,
                "path": "/studio/logo",
            }

        except ImportError:
            raise HTTPException(
                status_code=500,
                detail="cloudinary package not installed. Run: pip install cloudinary",
            )
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Cloudinary upload failed: {str(e)}",
            )

    else:
        # ── Local filesystem fallback (dev only) ───────────
        ext  = Path(file.filename or "logo.jpg").suffix.lower() or ".jpg"
        dest = UPLOAD_DIR / f"logo{ext}"

        # Remove old logo files
        for old in UPLOAD_DIR.glob("logo.*"):
            if old.name != "logo_url.txt":
                old.unlink()

        dest.write_bytes(contents)

        return {
            "message": "Logo saved locally (not persistent on Render — set CLOUDINARY_URL)",
            "path": "/studio/logo",
        }


# ── Get logo ───────────────────────────────────────────────

@router.get("/logo")
def get_logo():
    # 1. Try Cloudinary URL (persistent)
    cdn_url = _get_cloudinary_url()
    if cdn_url:
        return RedirectResponse(url=cdn_url, status_code=302)

    # 2. Try local filesystem (dev / fallback)
    for ext in [".png", ".jpg", ".jpeg", ".webp", ".svg"]:
        logo_path = UPLOAD_DIR / f"logo{ext}"
        if logo_path.exists():
            return FileResponse(str(logo_path))

    raise HTTPException(status_code=404, detail="No logo uploaded yet")


# ── Studio info ────────────────────────────────────────────

@router.get("/info")
def get_studio_info():
    return {
        "name":  os.getenv("STUDIO_NAME",  "Jeeva Fitness"),
        "phone": os.getenv("STUDIO_PHONE", "+919916486812"),
        "email": os.getenv("GMAIL_USER",   ""),
    }
