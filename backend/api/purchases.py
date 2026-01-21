from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from drivers.db_client import get_db
from services.purchaseService import PurchaseService
from drivers.dependencies import get_current_user, require_admin
# Import đầy đủ các Entities
from entities.purchase import SupplierCreateRequest, PurchaseOrderCreateRequest, SupplierResponse, PurchaseUpdateRequest

router = APIRouter()

# --- SUPPLIER APIs ---
@router.post("/suppliers/create")
def create_supplier(request: SupplierCreateRequest, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    service = PurchaseService(db)
    try:
        return service.create_supplier(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/suppliers", response_model=list[SupplierResponse])
def list_suppliers(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    service = PurchaseService(db)
    return service.get_all_suppliers()

# --- PURCHASE ORDER APIs ---

# 1. Tạo mới
@router.post("/purchases/create")
def create_purchase_order(request: PurchaseOrderCreateRequest, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    service = PurchaseService(db)
    try:
        return service.create_purchase_order(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# 2. Lấy danh sách (List)
@router.get("/purchases")
def list_purchase_orders(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    service = PurchaseService(db)
    return service.get_all_orders()

# 3. Lấy chi tiết 1 phiếu 
@router.get("/purchases/{po_id}")
def get_po_detail(po_id: int, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    service = PurchaseService(db)
    try:
        return service.get_po_detail(po_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

# 4. Cập nhật phiếu (PUT)
@router.put("/purchases/{po_id}")
def update_purchase_order(po_id: int, request: PurchaseUpdateRequest, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    service = PurchaseService(db)
    try:
        return service.update_po(po_id, request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))