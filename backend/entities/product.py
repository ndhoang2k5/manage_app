from pydantic import BaseModel
from typing import List, Optional

# --- 1. MODEL CHO NGUYÊN VẬT LIỆU LẺ ---
class MaterialCreateRequest(BaseModel):
    sku: str                # VD: "H10001"
    name: str               # VD: "Cúc nhựa trắng"
    unit: str = "Cái"       # Đơn vị
    cost_price: float = 0   # Giá vốn
    attributes: str = ""    # Ghi chú (VD: "Nhựa, 1cm")

class ProductVariantResponse(BaseModel):
    id: int
    sku: str
    variant_name: str
    category_name: str
    quantity_on_hand: float
    
    class Config:
        from_attributes = True

# --- 2. MODEL CHO NHÓM NGUYÊN VẬT LIỆU (SET) ---
class GroupItemRequest(BaseModel):
    material_variant_id: int # ID của cái cúc/vải
    quantity: float          # Số lượng trong set

class MaterialGroupCreateRequest(BaseModel):
    code: str                # VD: "SET-VEST-01"
    name: str                # VD: "Bộ phụ kiện Vest Nam"
    description: str = ""
    items: List[GroupItemRequest] # Danh sách các món trong set