from pydantic import BaseModel
from typing import List, Optional
from datetime import date

# 1. Các model con
class WorkshopInfo(BaseModel):
    id: int
    name: str
    address: Optional[str] = None

class WorkshopInventoryItem(BaseModel):
    sku: str
    name: str
    unit: str
    qty: float
    value: float
    type: str

class WorkshopProductionItem(BaseModel):
    code: str
    product: str
    planned: int
    finished: int
    status: str
    due_date: Optional[date] = None

# 2. Model trả về chính (Response Model)
class WorkshopDetailResponse(BaseModel):
    info: WorkshopInfo
    inventory: List[WorkshopInventoryItem]
    production: List[WorkshopProductionItem]
    total_asset_value: float