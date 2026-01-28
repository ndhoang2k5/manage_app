from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from drivers.db_client import get_db
from services.warehouseService import WarehouseService
from entities.warehouse import WarehouseCreateRequest, BrandCreateRequest, WarehouseResponse, BrandResponse, TransferCreateRequest, WarehouseUpdateRequest
from drivers.dependencies import get_current_user, get_allowed_warehouse_ids, require_admin


router = APIRouter()

# --- BRAND APIs ---
@router.post("/brands/create")
def create_brand(request: BrandCreateRequest, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    service = WarehouseService(db)
    try:
        return service.create_brand(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/brands", response_model=list[BrandResponse])
def list_brands(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    service = WarehouseService(db)
    return service.get_all_brands()

# --- WAREHOUSE APIs ---
@router.post("/warehouses/create")
def create_warehouse(request: WarehouseCreateRequest, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    service = WarehouseService(db)
    try:
        return service.create_warehouse(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/warehouses", response_model=list[WarehouseResponse])
def list_warehouses(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    allowed_ids = get_allowed_warehouse_ids(user, db)
    service = WarehouseService(db)
    return service.get_all_warehouses(allowed_ids)

@router.post("/warehouses/transfer")
def transfer_stock(request: TransferCreateRequest, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    service = WarehouseService(db)
    try:
        return service.create_transfer(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/warehouses/{id}")
def update_warehouse(id: int, request: WarehouseUpdateRequest, db: Session = Depends(get_db), admin: dict = Depends(get_current_user)):
    service = WarehouseService(db)
    try:
        return service.update_warehouse(id, request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/warehouses/{id}")
def delete_warehouse(id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    service = WarehouseService(db)
    try:
        return service.delete_warehouse(id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))