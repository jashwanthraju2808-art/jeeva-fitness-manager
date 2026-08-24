from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, field_validator


def _calculate_age(dob: date) -> int:
    today = date.today()
    return today.year - dob.year - (
        1 if (today.month, today.day) < (dob.month, dob.day) else 0
    )


MEMBERSHIP_TYPES = Literal["monthly", "3_months", "6_months", "yearly", "custom"]
FITNESS_GOALS    = Literal["weight_loss", "muscle_gain", "strength", "general_fitness",
                            "fat_loss", "flexibility", "other"]
GENDERS          = Literal["male", "female", "other"]


class MemberCreate(BaseModel):
    first_name:    str
    last_name:     Optional[str]  = None
    gender:        Optional[str]  = None
    date_of_birth: Optional[date] = None
    phone_number:  str
    email:         Optional[str]  = None
    emergency_contact: Optional[str] = None
    height_cm:     Optional[Decimal] = None
    weight_kg:     Optional[Decimal] = None
    health_notes:  Optional[str]  = None
    fitness_goal:  Optional[str]  = None
    join_date:     Optional[date] = None
    fee:           int
    batch_id:      Optional[int]  = None
    trainer:                Optional[str]  = None
    membership_type:        Optional[str]  = None
    membership_start_date:  Optional[date] = None
    membership_expiry_date: Optional[date] = None
    freeze_start_date:      Optional[date] = None
    freeze_end_date:        Optional[date] = None
    freeze_reason:          Optional[str]  = None

    @field_validator("email", mode="before")
    @classmethod
    def empty_email_to_none(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v

    @field_validator("last_name", "health_notes", "emergency_contact",
                     "trainer", "fitness_goal", "freeze_reason",
                     "gender", "membership_type", mode="before")
    @classmethod
    def empty_str_to_none(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v


class MemberUpdate(MemberCreate):
    pass


class BatchInfo(BaseModel):
    id: int
    name: str
    start_time: str
    end_time: str
    model_config = {"from_attributes": True}


class MemberResponse(BaseModel):
    id:            int
    first_name:    str
    last_name:     Optional[str]    = None
    gender:        Optional[str]    = None
    date_of_birth: Optional[date]   = None
    age:           Optional[int]    = None
    phone_number:  str
    email:         Optional[str]    = None
    emergency_contact: Optional[str] = None
    height_cm:     Optional[Decimal] = None
    weight_kg:     Optional[Decimal] = None
    health_notes:  Optional[str]    = None
    fitness_goal:  Optional[str]    = None
    join_date:     Optional[date]   = None
    fee:           int
    is_active:     bool
    trainer:                Optional[str]  = None
    membership_type:        Optional[str]  = None
    membership_start_date:  Optional[date] = None
    membership_expiry_date: Optional[date] = None
    freeze_start_date:      Optional[date] = None
    freeze_end_date:        Optional[date] = None
    freeze_reason:          Optional[str]  = None
    batch_id:      Optional[int]    = None
    batch_name:    Optional[str]    = None
    batch:         Optional[BatchInfo] = None
    created_at:    datetime

    model_config = {"from_attributes": True}

    @classmethod
    def model_validate(cls, obj, **kwargs):
        instance = super().model_validate(obj, **kwargs)
        if hasattr(obj, "batch") and obj.batch:
            instance.batch_name = obj.batch.name
        return instance

    def membership_status(self) -> str:
        """Compute display status: active / expiring_soon / expired / frozen."""
        today = date.today()
        # Frozen takes priority
        if self.freeze_start_date and self.freeze_end_date:
            if self.freeze_start_date <= today <= self.freeze_end_date:
                return "frozen"
        if not self.is_active:
            return "discontinued"
        if self.membership_expiry_date:
            days = (self.membership_expiry_date - today).days
            if days < 0:
                return "expired"
            if days <= 7:
                return "expiring_soon"
        return "active"
