from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel

PaymentStatus = Literal["paid", "not_paid"]
PaymentMethod = Literal["cash", "upi", "card", "bank_transfer", "other"]


class PaymentCreate(BaseModel):
    member_id:      int
    amount:         int
    month:          str              # "YYYY-MM"
    payment_date:   date
    note:           Optional[str]    = None
    status:         PaymentStatus    = "paid"
    payment_method: Optional[str]    = None


class PaymentResponse(BaseModel):
    id:             int
    member_id:      int
    amount:         int
    month:          str
    payment_date:   date
    note:           Optional[str]    = None
    status:         str              = "paid"
    payment_method: Optional[str]    = None
    created_at:     datetime

    model_config = {"from_attributes": True}
