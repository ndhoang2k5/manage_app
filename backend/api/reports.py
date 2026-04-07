from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from drivers.db_client import get_db
from services.reportService import ReportService
from entities.report import WorkshopDetailResponse
from drivers.dependencies import require_module_access, assert_warehouse_scope, get_allowed_warehouse_ids
from fastapi.responses import StreamingResponse

router = APIRouter()

# 1. Báo cáo Dashboard Kho Tổng
@router.get("/reports/central-dashboard/{warehouse_id}")
def get_central_dashboard(
    warehouse_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("reports")),
):
    service = ReportService(db)
    try:
        assert_warehouse_scope(user, db, warehouse_id)
        allowed_ids = get_allowed_warehouse_ids(user, db)
        return service.get_central_warehouse_dashboard(warehouse_id, visible_warehouse_ids=allowed_ids)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
# 2. Báo cáo Chi tiết Xưởng Con
@router.get("/reports/workshop/{warehouse_id}", response_model=WorkshopDetailResponse)
def get_workshop_detail(
    warehouse_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("reports")),
):
    service = ReportService(db)
    try:
        assert_warehouse_scope(user, db, warehouse_id)
        return service.get_workshop_detail(warehouse_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# 3. Báo cáo Xuất Excel Inventory Kho Tổng
@router.get("/reports/export-inventory/{warehouse_id}")
def export_inventory(
    warehouse_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("reports")),
):
    service = ReportService(db)
    try:
        assert_warehouse_scope(user, db, warehouse_id)
        # Hàm này trả về thẳng một file Excel (StreamingResponse)
        allowed_ids = get_allowed_warehouse_ids(user, db)
        return service.export_inventory_excel(warehouse_id, visible_warehouse_ids=allowed_ids)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))