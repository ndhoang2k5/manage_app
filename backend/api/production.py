from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from drivers.db_client import get_db
from services.productionService import ProductionService
# Import đầy đủ các Request Model
from entities.production import BOMCreateRequest, ProductionOrderCreateRequest, QuickProductionRequest, ReceiveGoodsRequest
import shutil
import uuid

router = APIRouter()

# --- CÁC API CŨ ---
@router.get("/production/orders")
def list_orders(db: Session = Depends(get_db)):
    service = ProductionService(db)
    return service.get_all_orders()

@router.get("/production/boms")
def list_boms(db: Session = Depends(get_db)):
    service = ProductionService(db)
    return service.get_all_boms()

@router.post("/production/bom/create")
def create_bom(request: BOMCreateRequest, db: Session = Depends(get_db)):
    service = ProductionService(db)
    try:
        return service.create_bom(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/production/orders/create")
def create_order(request: ProductionOrderCreateRequest, db: Session = Depends(get_db)):
    service = ProductionService(db)
    try:
        return service.create_order(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/production/orders/create-quick")
def create_quick_order(request: QuickProductionRequest, db: Session = Depends(get_db)):
    service = ProductionService(db)
    try:
        return service.create_quick_order(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/production/orders/{order_id}/start")
def start_production(order_id: int, db: Session = Depends(get_db)):
    service = ProductionService(db)
    try:
        return service.start_production(order_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/production/orders/{order_id}/complete")
def finish_production(order_id: int, db: Session = Depends(get_db)):
    service = ProductionService(db)
    try:
        return service.finish_production(order_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- CÁC API MỚI (QUAN TRỌNG ĐỂ SỬA LỖI CỦA BẠN) ---

# 1. API Lấy chi tiết Size (Nguyên nhân gây lỗi nếu thiếu cái này)
@router.get("/production/orders/{order_id}/details")
def get_order_details(order_id: int, db: Session = Depends(get_db)):
    service = ProductionService(db)
    return service.get_order_details(order_id)

# 2. API Nhập hàng từng đợt
@router.post("/production/orders/{order_id}/receive")
def receive_goods(order_id: int, request: ReceiveGoodsRequest, db: Session = Depends(get_db)):
    service = ProductionService(db)
    try:
        return service.receive_goods(order_id, request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# 3. API Chốt đơn
@router.post("/production/orders/{order_id}/force-finish")
def force_finish(order_id: int, db: Session = Depends(get_db)):
    service = ProductionService(db)
    return service.force_finish_order(order_id)

@router.get("/production/orders/{order_id}/print")
def get_order_print_data(order_id: int, db: Session = Depends(get_db)):
    service = ProductionService(db)
    return service.get_order_print_data(order_id)

@router.post("/production/upload")
def upload_image(file: UploadFile = File(...)):
    try:
        # Tạo tên file độc nhất để không trùng
        file_extension = file.filename.split(".")[-1]
        new_filename = f"{uuid.uuid4()}.{file_extension}"
        file_path = f"static/images/{new_filename}"
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Trả về đường dẫn ảnh để Frontend lưu vào list
        return {"url": f"/static/images/{new_filename}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi upload: {str(e)}")