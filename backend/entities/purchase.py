from pydantic import BaseModel
from typing import List, Optional
from datetime import date

# --- 1. NHÀ CUNG CẤP (SUPPLIER) ---
class SupplierCreateRequest(BaseModel):
    name: str
    phone: Optional[str] = None # <--- Cho phép None
    address: Optional[str] = None # <--- Cho phép None (phòng hờ luôn)

class SupplierResponse(BaseModel):
    id: int
    name: str
    phone: Optional[str] = None

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

class POItemRequest(BaseModel):
    product_variant_id: int
    quantity: float
    unit_price: float

class PurchaseOrderCreateRequest(BaseModel):
    warehouse_id: int
    po_code: str
    order_date: Optional[date] = None
    items: List[POItemRequest]
    
    # Cập nhật logic NCC: 1 trong 2 cái này phải có dữ liệu
    supplier_id: Optional[int] = None       # Chọn NCC cũ
    new_supplier_name: Optional[str] = None # Hoặc Nhập NCC mới

class POItemUpdateRequest(BaseModel):
    id: int         # Cần ID để biết sửa dòng nào
    unit_price: float
    quantity: float # Cho phép sửa số lượng

class PurchaseUpdateRequest(BaseModel):
    po_code: str
    supplier_id: int
    order_date: date
    items: List[POItemUpdateRequest]