from pydantic import BaseModel
from typing import List, Optional

# --- 1. MODEL CHO NGUYÊN VẬT LIỆU LẺ ---
class MaterialCreateRequest(BaseModel):
    sku: str                # VD: "H10001"
    name: str               # VD: "Cúc nhựa trắng"
    unit: str = "Cái"       # Đơn vị
    cost_price: float = 0   # Giá vốn
    attributes: str = ""    # Ghi chú (VD: "Nhựa, 1cm")
    note: Optional[str] = ""  # Ghi chú thêm

class ProductVariantResponse(BaseModel):
    id: int
    sku: str
    variant_name: str
    category_name: str
    quantity_on_hand: float
    cost_price: float = 0 
    note: Optional[str] = ""
    
    class Config:
        from_attributes = True

# --- 2. MODEL CHO NHÓM NGUYÊN VẬT LIỆU (SET) ---
class GroupItemRequest(BaseModel):
    material_variant_id: int # ID của cái cúc/vải
    quantity: float          # Số lượng trong set

# --- 3. REQUEST TẠO NHÓM NGUYÊN VẬT LIỆU ---
class MaterialGroupCreateRequest(BaseModel):
    code: str                # VD: "SET-VEST-01"
    name: str                # VD: "Bộ phụ kiện Vest Nam"
    description: str = ""
    items: List[GroupItemRequest] # Danh sách các món trong set


# --- 4. REQUEST CẬP NHẬT NGUYÊN VẬT LIỆU ---
class MaterialUpdateRequest(BaseModel):
    sku: str
    name: str
    unit: str
    attributes: Optional[str] = ""
    note: Optional[str] = ""