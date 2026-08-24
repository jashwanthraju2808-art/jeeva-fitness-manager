from datetime import date
from typing import Optional

from pydantic import BaseModel


class AttendanceCreate(BaseModel):
    member_id: int
    att_date: date
    present: bool = True


class AttendanceResponse(BaseModel):
    id: int
    member_id: int
    att_date: date
    present: bool

    model_config = {"from_attributes": True}


class AttendanceReportEntry(BaseModel):
    member_id: int
    member_name: str
    present_days: int
    absent_days: int
    total_days: int
