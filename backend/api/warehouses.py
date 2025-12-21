from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from drivers.db_client import get_db
from services.warehouseService import WarehouseService
from entities.warehouse import WarehouseCreateRequest, BrandCreateRequest, WarehouseResponse, BrandResponse, TransferCreateRequest
from security import get_current_user

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
    service = WarehouseService(db)
    return service.get_all_warehouses()

@router.post("/warehouses/transfer")
def transfer_stock(request: TransferCreateRequest, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    service = WarehouseService(db)
    try:
        return service.create_transfer(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))