from pydantic import BaseModel
from typing import List, Optional

# --- 1. MODEL PHẢN HỒI (RESPONSE) ---
# Dùng để trả dữ liệu về cho Frontend hiển thị
class ProductVariantResponse(BaseModel):
    id: int
    sku: str
    variant_name: str
    category_name: str
    quantity_on_hand: float
    cost_price: float = 0 
    note: Optional[str] = ""
    color: Optional[str] = "" # Thêm trường màu để hiển thị nếu cần
    
    class Config:
        from_attributes = True

# --- 2. MODEL CHO NHÓM NGUYÊN VẬT LIỆU (SET) ---
class GroupItemRequest(BaseModel):
    material_variant_id: int 
    quantity: float          

class MaterialGroupCreateRequest(BaseModel):
    code: str                
    name: str                
    description: str = ""
    items: List[GroupItemRequest] 

# --- 3. MODEL CẬP NHẬT (UPDATE - SỬA LẺ) ---
class MaterialUpdateRequest(BaseModel):
    sku: str
    name: str
    unit: str
    attributes: Optional[str] = ""
    note: Optional[str] = ""

# --- 4. MODEL TẠO MỚI (CREATE - ĐA MÀU SẮC) ---
# Đây là cấu trúc chuẩn cho tính năng mới

# Model con: Chi tiết từng màu
class ColorVariantRequest(BaseModel):
    sku: str
    color_name: str  # VD: Trắng, Xanh
    cost_price: float = 0
    note: Optional[str] = ""

# Model cha: Vật tư chung
class MaterialCreateRequest(BaseModel):
    name: str        # Tên chung: Vải Linen
    unit: str = "Cái"
    variants: List[ColorVariantRequest] # Danh sách các màu