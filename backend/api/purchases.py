from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from drivers.db_client import get_db
from services.purchaseService import PurchaseService
from entities.purchase import SupplierCreateRequest, PurchaseOrderCreateRequest, SupplierResponse

router = APIRouter()

# --- SUPPLIER APIs ---
@router.post("/suppliers/create")
def create_supplier(request: SupplierCreateRequest, db: Session = Depends(get_db)):
    service = PurchaseService(db)
    try:
        return service.create_supplier(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/suppliers", response_model=list[SupplierResponse])
def list_suppliers(db: Session = Depends(get_db)):
    service = PurchaseService(db)
    return service.get_all_suppliers()

# --- PURCHASE ORDER APIs ---
@router.post("/purchases/create")
def create_purchase_order(request: PurchaseOrderCreateRequest, db: Session = Depends(get_db)):
    service = PurchaseService(db)
    try:
        return service.create_purchase_order(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
# 2. Lấy danh sách Đơn nhập hàng
@router.get("/purchases")
def list_purchase_orders(db: Session = Depends(get_db)):
    service = PurchaseService(db)
    return service.get_all_orders()