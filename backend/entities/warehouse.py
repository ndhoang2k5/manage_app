from pydantic import BaseModel
from typing import Optional
from typing import List

# --- 1. BRAND (NHÃN HÀNG) ---
class BrandCreateRequest(BaseModel):
    name: str  # VD: "Brand A - Công sở"

class BrandResponse(BaseModel):
    id: int
    name: str

class WarehouseCreateRequest(BaseModel):
    brand_id: int       # Kho này thuộc Brand nào (ID)
    name: str           # VD: "Xưởng May 1"
    is_central: bool = False  # True: Kho Tổng, False: Xưởng con
    address: str = ""

    class Config:
        json_schema_extra = {
            "example": {
                "brand_id": 1,
                "name": "Kho Tổng Brand A",
                "is_central": True,
                "address": "123 Giải Phóng, HN"
            }
        }

class WarehouseResponse(BaseModel):
    id: int
    name: str
    type_name: str  # Trả về chữ "Kho Tổng" hoặc "Xưởng" cho dễ đọc
    brand_name: str
    address: str

# --- 3. TRANSFER (ĐIỀU CHUYỂN) ---
class TransferItem(BaseModel):
    product_variant_id: int
    quantity: float

class TransferCreateRequest(BaseModel):
    from_warehouse_id: int  # Kho đi
    to_warehouse_id: int    # Kho đến
    items: List[TransferItem]
class WarehouseUpdateRequest(BaseModel):
    name: str
    address: Optional[str] = None