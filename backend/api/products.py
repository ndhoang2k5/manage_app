# backend/api/products.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from drivers.db_client import get_db
from services.productService import ProductService
from entities.product import VariantCreateRequest, ProductVariantResponse

router = APIRouter()

@router.post("/materials/create")
def create_new_material(request: VariantCreateRequest, db: Session = Depends(get_db)):
    service = ProductService(db)
    try:
        return service.create_material(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/materials", response_model=list[ProductVariantResponse])
def list_materials(db: Session = Depends(get_db)):
    service = ProductService(db)
    return service.get_all_materials()