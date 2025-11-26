from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from drivers.db_client import get_db
from services.productService import ProductService
from entities.product import MaterialCreateRequest, MaterialGroupCreateRequest, ProductVariantResponse

router = APIRouter()

# 1. API Tạo mới NVL lẻ
@router.post("/materials/create")
def create_material(request: MaterialCreateRequest, db: Session = Depends(get_db)):
    service = ProductService(db)
    try:
        return service.create_material(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# 2. API Tạo Nhóm NVL (Set)
@router.post("/materials/groups/create")
def create_group(request: MaterialGroupCreateRequest, db: Session = Depends(get_db)):
    service = ProductService(db)
    try:
        return service.create_material_group(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# 3. API Lấy danh sách NVL
@router.get("/materials", response_model=list[ProductVariantResponse])
def get_materials(db: Session = Depends(get_db)):
    service = ProductService(db)
    return service.get_all_materials()