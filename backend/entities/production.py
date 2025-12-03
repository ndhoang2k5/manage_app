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


# --- MỚI THÊM: YÊU CẦU THEO SIZE VÀ SỐ LƯỢNG ---
class SizeQuantityRequest(BaseModel):
    size: str           # VD: "0-3m"
    quantity: int       # VD: 100
    note: Optional[str] = ""



# --- 4. YÊU CẦU TẠO SẢN PHẨM NHANH (TẠO MỚI SẢN PHẨM + TẠO BOM + TẠO LỆNH SX) ---
class QuickProductionRequest(BaseModel):
    new_product_name: str
    new_product_sku: str
    
    order_code: str
    warehouse_id: int
    # quantity_planned: int  <-- XÓA CÁI NÀY (Vì tổng sẽ tự tính từ list size)
    
    start_date: date
    due_date: date
    
    materials: List[BOMItemRequest]
    
    # --- MỚI THÊM: DANH SÁCH SIZE ---
    size_breakdown: List[SizeQuantityRequest] 
    
    auto_start: bool = False


# Request cho việc Nhập kho thành phẩm từng đợt (Trả hàng)
class ReceiveGoodsRequest(BaseModel):
    # Danh sách các size được trả trong đợt này
    items: List[SizeQuantityRequest]