from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from drivers.db_client import get_db
from services.productionService import ProductionService
from entities.production import BOMCreateRequest, ProductionOrderCreateRequest

router = APIRouter()

# 1. Tạo BOM
@router.post("/production/bom/create")
def create_bom(request: BOMCreateRequest, db: Session = Depends(get_db)):
    service = ProductionService(db)
    try:
        return service.create_bom(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# 2. Tạo Lệnh SX (Draft)
@router.post("/production/orders/create")
def create_order(request: ProductionOrderCreateRequest, db: Session = Depends(get_db)):
    service = ProductionService(db)
    try:
        return service.create_order(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# 3. Bắt đầu SX (Check kho & Giữ hàng)
@router.post("/production/orders/{order_id}/start")
def start_production(order_id: int, db: Session = Depends(get_db)):
    service = ProductionService(db)
    try:
        return service.start_production(order_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# 4. Hoàn thành SX (Trừ NVL, Cộng Thành phẩm)
@router.post("/production/orders/{order_id}/complete")
def finish_production(order_id: int, db: Session = Depends(get_db)):
    service = ProductionService(db)
    try:
        return service.finish_production(order_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# 5. Danh sách Lệnh SX
@router.get("/production/orders")
def list_orders(db: Session = Depends(get_db)):
    service = ProductionService(db)
    return service.get_all_orders()

# 6. Danh sách BOM
@router.get("/production/boms")
def list_boms(db: Session = Depends(get_db)):
    service = ProductionService(db)
    return service.get_all_boms()