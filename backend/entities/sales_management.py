from pydantic import BaseModel, Field
from typing import List, Optional


class SalesFetchRequest(BaseModel):
    time_start: int
    time_end: int
    force_refresh: bool = False


class PriorityCodesUpsertRequest(BaseModel):
    codes: List[str] = Field(default_factory=list)
    mode: str = "replace"  # replace | append
    note: Optional[str] = ""


class SalesBackfillRequest(BaseModel):
    time_start: Optional[int] = None
    time_end: Optional[int] = None
    chunk_hours: int = 24
    max_chunks: int = 400
