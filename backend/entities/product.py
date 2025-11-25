# backend/entities/product.py
from pydantic import BaseModel
from typing import Optional, List

# Khuôn mẫu để tạo mới Variant (Input)
class VariantCreateRequest(BaseModel):
    product_name: str       # VD: "Cúc Áo" (sẽ tạo hoặc tìm trong bảng products)
    sku: str                # VD: "H10001"
    variant_name: str       # VD: "Cúc trắng 1cm"
    attributes: str = ""    # VD: "Nhựa, trắng"
    cost_price: float = 0
    base_unit: str = "Cái"

# Khuôn mẫu dữ liệu trả về (Output)
class ProductVariantResponse(BaseModel):
    id: int
    sku: str
    variant_name: str
    category_name: str
    quantity_on_hand: float
    
    class Config:
        from_attributes = True