from pydantic import BaseModel, Field
from typing import List, Optional


class SalesFetchRequest(BaseModel):
    time_start: int
    time_end: int
    force_refresh: bool = False
    brand_key: str = "unbee"


class PriorityCodesUpsertRequest(BaseModel):
    codes: List[str] = Field(default_factory=list)
    mode: str = "replace"  # replace | append
    note: Optional[str] = ""
    brand_key: str = "unbee"


class SalesBackfillRequest(BaseModel):
    time_start: Optional[int] = None
    time_end: Optional[int] = None
    chunk_hours: int = 24
    max_chunks: int = 400
    brand_key: str = "unbee"


class ProductPlanning4WRequest(BaseModel):
    codes: List[str] = Field(default_factory=list)
    anchor_time_ms: Optional[int] = None
    weeks: int = 4


class ProductCodeSearchRequest(BaseModel):
    keyword: Optional[str] = ""
    limit: int = 30
