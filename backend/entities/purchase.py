from pydantic import BaseModel
from typing import List, Optional
from datetime import date

# --- 1. NHÀ CUNG CẤP (SUPPLIER) ---
class SupplierCreateRequest(BaseModel):
    name: str
    phone: str = ""
    address: str = ""

class SupplierResponse(BaseModel):
    id: int
    name: str
    phone: str

# --- 2. PHIẾU NHẬP (PURCHASE ORDER) ---
class POItemRequest(BaseModel):
    product_variant_id: int  # Nhập mã hàng nào (ID)
    quantity: float          # Số lượng nhập
    unit_price: float        # Giá nhập tại thời điểm này

class PurchaseOrderCreateRequest(BaseModel):
    warehouse_id: int        # Nhập vào kho nào
    supplier_id: int         # Mua của ai
    po_code: str             # Mã phiếu (VD: PO-2025-001)
    order_date: Optional[date] = None 
    items: List[POItemRequest] # Danh sách hàng hóa

    class Config:
        json_schema_extra = {
            "example": {
                "warehouse_id": 1,
                "supplier_id": 1,
                "po_code": "PO-TEST-01",
                "items": [
                    { "product_variant_id": 1, "quantity": 100, "unit_price": 50000 },
                    { "product_variant_id": 3, "quantity": 500, "unit_price": 200 }
                ]
            }
        }