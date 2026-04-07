from typing import Optional
import io

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from openpyxl import Workbook

from drivers.db_client import get_db
from drivers.dependencies import require_module_access
from entities.sales_management import SalesFetchRequest, PriorityCodesUpsertRequest, SalesBackfillRequest
from services.salesManagementService import SalesManagementService

router = APIRouter()


@router.post("/sales-management/fetch")
def fetch_sales_report(
    req: SalesFetchRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("sales-management", require_manage=True)),
):
    try:
        service = SalesManagementService(db)
        result = service.fetch_and_store(
            time_start=req.time_start,
            time_end=req.time_end,
            user=user,
            force_refresh=req.force_refresh,
        )
        return {"status": "success", "data": result}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/sales-management/report")
def get_sales_report(
    run_id: Optional[int] = None,
    time_start: Optional[int] = Query(None),
    time_end: Optional[int] = Query(None),
    keyword: Optional[str] = Query(None),
    only_priority_codes: bool = Query(False),
    min_qty: float = Query(0),
    min_revenue: float = Query(0),
    page: int = Query(1),
    page_size: int = Query(50),
    sort_by: str = Query("sold_qty"),
    sort_dir: str = Query("desc"),
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("sales-management")),
):
    try:
        service = SalesManagementService(db)
        result = service.get_report(
            run_id=run_id,
            time_start=time_start,
            time_end=time_end,
            keyword=keyword,
            only_priority_codes=only_priority_codes,
            min_qty=min_qty,
            min_revenue=min_revenue,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_dir=sort_dir,
        )
        return {"status": "success", "data": result}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/sales-management/sync-status")
def get_sync_status(
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("sales-management")),
):
    try:
        service = SalesManagementService(db)
        data = service.get_sync_status()
        return {"status": "success", "data": data}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/sales-management/sync-now")
def sync_now(
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("sales-management", require_manage=True)),
):
    try:
        service = SalesManagementService(db)
        result = service.sync_now(user=user)
        return {"status": "success", "data": result}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/sales-management/sync-stock")
def sync_stock(
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("sales-management", require_manage=True)),
):
    try:
        service = SalesManagementService(db)
        result = service.sync_product_stock()
        return {"status": "success", "data": result}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/sales-management/backfill")
def backfill_history(
    req: SalesBackfillRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("sales-management", require_manage=True)),
):
    try:
        service = SalesManagementService(db)
        result = service.backfill_history(
            user=user,
            time_start=req.time_start,
            time_end=req.time_end,
            chunk_hours=req.chunk_hours,
            max_chunks=req.max_chunks,
        )
        return {"status": "success", "data": result}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/sales-management/priority-codes")
def get_priority_codes(
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("sales-management")),
):
    try:
        service = SalesManagementService(db)
        data = service.get_priority_codes()
        return {"status": "success", "data": data}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/sales-management/priority-codes")
def upsert_priority_codes(
    req: PriorityCodesUpsertRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("sales-management", require_manage=True)),
):
    try:
        service = SalesManagementService(db)
        result = service.save_priority_codes(
            codes=req.codes,
            user=user,
            mode=req.mode,
            note=req.note or "",
        )
        return {"status": "success", "data": result}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/sales-management/export")
def export_sales_report(
    run_id: Optional[int] = None,
    time_start: Optional[int] = Query(None),
    time_end: Optional[int] = Query(None),
    keyword: Optional[str] = Query(None),
    only_priority_codes: bool = Query(False),
    min_qty: float = Query(0),
    min_revenue: float = Query(0),
    sort_by: str = Query("sold_qty"),
    sort_dir: str = Query("desc"),
    top_n: int = Query(0),
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("sales-management")),
):
    try:
        service = SalesManagementService(db)
        rows = service.get_report_for_export(
            run_id=run_id,
            time_start=time_start,
            time_end=time_end,
            keyword=keyword,
            only_priority_codes=only_priority_codes,
            min_qty=min_qty,
            min_revenue=min_revenue,
            sort_by=sort_by,
            sort_dir=sort_dir,
            top_n=top_n,
        )

        wb = Workbook()
        ws = wb.active
        ws.title = "sales_report"
        ws.append([
            "Ma SP",
            "Ten san pham",
            "SL ban",
            "Doanh so",
            "Ton kho hien tai",
            "Kenh",
            "So shop",
            "Uu tien",
        ])
        for row in rows:
            ws.append([
                row.get("code", ""),
                row.get("name", ""),
                row.get("sold_qty", 0),
                row.get("sold_revenue", 0),
                row.get("current_stock", 0),
                ", ".join(row.get("channels", [])),
                row.get("shops_count", 0),
                "Yes" if row.get("is_priority") else "",
            ])

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)

        filename = "sales_report.xlsx"
        if time_start and time_end:
            filename = f"sales_report_{time_start}_{time_end}.xlsx"

        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
