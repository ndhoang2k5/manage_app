from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from drivers.db_client import get_db
from services.reportService import ReportService
from entities.report import WorkshopDetailResponse

router = APIRouter()

# 1. Báo cáo Dashboard Kho Tổng
@router.get("/reports/central-dashboard/{warehouse_id}")
def get_central_dashboard(warehouse_id: int, db: Session = Depends(get_db)):
    service = ReportService(db)
    try:
        return service.get_central_warehouse_dashboard(warehouse_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
# 2. Báo cáo Chi tiết Xưởng Con
@router.get("/reports/workshop/{warehouse_id}", response_model=WorkshopDetailResponse)
def get_workshop_detail(warehouse_id: int, db: Session = Depends(get_db)):
    service = ReportService(db)
    try:
        return service.get_workshop_detail(warehouse_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))