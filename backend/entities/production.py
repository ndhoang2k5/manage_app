from pydantic import BaseModel
from typing import List, Optional
from datetime import date

# --- 1. BOM (CÔNG THỨC) ---
class BOMItemRequest(BaseModel):
    material_variant_id: int # ID vải, cúc
    quantity_needed: float   # Cần bao nhiêu cho 1 sản phẩm

class BOMCreateRequest(BaseModel):
    product_variant_id: int  # Sản phẩm đầu ra (VD: Áo Sơ mi ID 6)
    name: str                # VD: "Công thức Mùa Hè 2025"
    materials: List[BOMItemRequest]

    class Config:
        json_schema_extra = {
            "example": {
                "product_variant_id": 6,
                "name": "Công thức Áo Sơ mi Basic",
                "materials": [
                    { "material_variant_id": 1, "quantity_needed": 1.2 }, 
                    { "material_variant_id": 3, "quantity_needed": 5 }
                ]
            }
        }

# --- 2. PRODUCTION ORDER (LỆNH SẢN XUẤT) ---
class ProductionOrderCreateRequest(BaseModel):
    code: str                # Mã lệnh: LSX-001
    warehouse_id: int        # Xưởng nào may (VD: Xưởng 1)
    product_variant_id: int  # May cái gì (Áo Sơ mi)
    quantity_planned: int    # Số lượng (100 cái)
    start_date: date
    due_date: date


# --- 3. YÊU CẦU TẠO SẢN PHẨM NHANH (TẠO MỚI SẢN PHẨM + TẠO BOM + TẠO LỆNH SX) ---
class QuickProductionRequest(BaseModel):
    # Thông tin sản phẩm mới
    new_product_name: str     # VD: "Váy Dạ Hội 2025"
    new_product_sku: str      # VD: "VAY-DH-01"
    
    # Thông tin Lệnh SX
    order_code: str           # VD: "LSX-005"
    warehouse_id: int         # Xưởng may
    quantity_planned: int     # Số lượng may
    start_date: date
    due_date: date
    
    # Công thức (NVL đi kèm)
    materials: List[BOMItemRequest] # Danh sách vải, cúc
    
    # Tùy chọn
    auto_start: bool = False  # True: Tự động giữ kho (Trừ kho) ngay lập tức