from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from drivers.db_client import get_db
from services.productionService import ProductionService
from entities.production import BOMCreateRequest, ProductionOrderCreateRequest, QuickProductionRequest, ReceiveGoodsRequest, ProductionUpdateRequest, UpdateProgressRequest, ProgressItem
import shutil
import uuid
from typing import Optional
from drivers.dependencies import get_current_user, get_allowed_warehouse_ids, require_admin 
router = APIRouter()

@router.get("/production/orders")
def list_orders(
    page: int = 1, 
    limit: int = 10, 
    search: Optional[str] = None, 
    warehouse: Optional[str] = None,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user) # 1. Bắt buộc đăng nhập
):
    # 2. Tính toán quyền
    allowed_ids = get_allowed_warehouse_ids(user, db)

    service = ProductionService(db)
    # 3. Truyền quyền vào Service
    return service.get_all_orders(page, limit, search, warehouse, allowed_warehouse_ids=allowed_ids)

@router.get("/production/boms")
def list_boms(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
    ):
    service = ProductionService(db)
    return service.get_all_boms()

@router.post("/production/bom/create")
def create_bom(
    request: BOMCreateRequest, 
    db: Session = Depends(get_db), 
    user: dict = Depends(get_current_user)
    ):
    service = ProductionService(db)
    try:
        return service.create_bom(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/production/orders/create")
def create_order(request: ProductionOrderCreateRequest, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    service = ProductionService(db)
    try:
        return service.create_order(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/production/orders/create-quick")
def create_quick_order(request: QuickProductionRequest, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    service = ProductionService(db)
    try:
        return service.create_quick_order(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/production/orders/{order_id}/start")
def start_production(order_id: int, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    service = ProductionService(db)
    try:
        return service.start_production(order_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/production/orders/{order_id}/complete")
def finish_production(order_id: int, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    service = ProductionService(db)
    try:
        return service.finish_production(order_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# 1. API Lấy chi tiết Size (Nguyên nhân gây lỗi nếu thiếu cái này)
@router.get("/production/orders/{order_id}/details")
def get_order_details(order_id: int, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    service = ProductionService(db)
    return service.get_order_details(order_id)

# 2. API Nhập hàng từng đợt
@router.post("/production/orders/{order_id}/receive")
def receive_goods(order_id: int, request: ReceiveGoodsRequest, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    service = ProductionService(db)
    try:
        return service.receive_goods(order_id, request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# 3. API Chốt đơn
@router.post("/production/orders/{order_id}/force-finish")
def force_finish(order_id: int, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    service = ProductionService(db)
    return service.force_finish_order(order_id)

@router.get("/production/orders/{order_id}/print")
def get_order_print_data(order_id: int, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    service = ProductionService(db)
    return service.get_order_print_data(order_id)

@router.post("/production/upload")
def upload_image(file: UploadFile = File(...)):
    try:
        file_extension = file.filename.split(".")[-1]
        new_filename = f"{uuid.uuid4()}.{file_extension}"
        file_path = f"static/images/{new_filename}"
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        return {"url": f"/static/images/{new_filename}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi upload: {str(e)}")
    
# 4. API Lấy lịch sử nhập hàng theo đợt
@router.get("/production/orders/{order_id}/history")
def get_receive_history(order_id: int, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    service = ProductionService(db)
    return service.get_receive_history(order_id)

# 5. API Cập nhật thông tin lệnh sản xuất (Chi phí và ngày tháng)
@router.put("/production/orders/{order_id}")
def update_order(order_id: int, request: ProductionUpdateRequest, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    service = ProductionService(db)
    try:
        return service.update_production_order(order_id, request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
@router.delete("/production/orders/{order_id}")
def delete_order(order_id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    service = ProductionService(db)
    try:
        return service.delete_production_order(order_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/production/orders/{order_id}/progress")
def update_progress(order_id: int, request: UpdateProgressRequest, db: Session = Depends(get_db)):
    service = ProductionService(db)
    try:
        return service.update_progress(order_id, request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
# 6. API Hoàn tác nhập hàng
@router.delete("/production/receive-logs/{log_id}")
def revert_receive(log_id: int, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    service = ProductionService(db)
    try:
        return service.revert_receive_log(log_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
# 7. API Lấy danh sách đặt trước cho lệnh sản xuất
@router.get("/production/orders/{order_id}/reservations")
def get_order_reservations(order_id: int, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    service = ProductionService(db)
    return service.get_order_reservations(order_id)