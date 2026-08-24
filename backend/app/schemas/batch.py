from pydantic import BaseModel


class BatchResponse(BaseModel):
    id: int
    name: str
    start_time: str
    end_time: str

    model_config = {"from_attributes": True}


class BatchCreate(BaseModel):
    name: str
    start_time: str
    end_time: str
