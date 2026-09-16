from typing import Optional
import io

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from openpyxl import Workbook

from drivers.db_client import get_db
from drivers.dependencies import require_module_access
from entities.sales_management import (
    SalesFetchRequest,
    PriorityCodesUpsertRequest,
    SalesBackfillRequest,
    ProductPlanning4WRequest,
)
from services.salesManagementService import SalesManagementService
from services.householdSalesService import HouseholdSalesService
from drivers.error_messages import humanize_error

router = APIRouter()


@router.get("/sales-management/households")
def list_sales_households(
    user: dict = Depends(require_module_access("sales-management")),
):
    return {"status": "success", "data": HouseholdSalesService.list_households()}


@router.get("/sales-management/household/report")
def get_household_sales_report(
    household_key: str = Query(...),
    time_start: int = Query(...),
    time_end: int = Query(...),
    keyword: Optional[str] = Query(None),
    min_qty: float = Query(0),
    min_revenue: float = Query(0),
    page: int = Query(1),
    page_size: int = Query(50),
    sort_by: str = Query("sold_qty"),
    sort_dir: str = Query("desc"),
    top_n: int = Query(0),
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("sales-management")),
):
    try:
        data = HouseholdSalesService(db).get_report(
            household_key=household_key,
            time_start=time_start,
            time_end=time_end,
            keyword=keyword,
            min_qty=min_qty,
            min_revenue=min_revenue,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_dir=sort_dir,
            top_n=top_n,
        )
        return {"status": "success", "data": data}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=humanize_error(exc))


@router.get("/sales-management/household/export")
def export_household_sales_report(
    household_key: str = Query(...),
    time_start: int = Query(...),
    time_end: int = Query(...),
    keyword: Optional[str] = Query(None),
    min_qty: float = Query(0),
    min_revenue: float = Query(0),
    sort_by: str = Query("sold_qty"),
    sort_dir: str = Query("desc"),
    top_n: int = Query(0),
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("sales-management")),
):
    try:
        data = HouseholdSalesService(db).get_report(
            household_key=household_key,
            time_start=time_start,
            time_end=time_end,
            keyword=keyword,
            min_qty=min_qty,
            min_revenue=min_revenue,
            page=1,
            page_size=5000,
            sort_by=sort_by,
            sort_dir=sort_dir,
            top_n=top_n,
        )

        wb = Workbook()
        ws = wb.active
        ws.title = "household_sales"
        ws.append([
            "Ma SP",
            "Ten san pham",
            "SL ban",
            "Doanh so",
            "Ton kho hien tai",
            "Kenh",
            "Shop",
            "Shop ID",
            "Nguon Salework",
        ])
        for row in data.get("items") or []:
            shops = row.get("shops") or []
            ws.append([
                row.get("code", ""),
                row.get("name", ""),
                row.get("sold_qty", 0),
                row.get("sold_revenue", 0),
                row.get("current_stock", 0),
                ", ".join(row.get("channels") or []),
                ", ".join(sorted({str(s.get("shop_name") or "") for s in shops if s.get("shop_name")})),
                ", ".join(sorted({str(s.get("shop_id") or "") for s in shops if s.get("shop_id")})),
                ", ".join(sorted({str(s.get("brand_key") or "") for s in shops if s.get("brand_key")})),
            ])

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="sales_household_{household_key}_{time_start}_{time_end}.xlsx"'
            },
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=humanize_error(exc))


@router.post("/sales-management/fetch")
def fetch_sales_report(
    req: SalesFetchRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("sales-management", require_manage=True)),
):
    try:
        service = SalesManagementService(db, brand_key=req.brand_key)
        result = service.fetch_and_store(
            time_start=req.time_start,
            time_end=req.time_end,
            user=user,
            force_refresh=req.force_refresh,
        )
        return {"status": "success", "data": result}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=humanize_error(exc))


@router.get("/sales-management/report")
def get_sales_report(
    brand_key: str = Query("unbee"),
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
    top_n: int = Query(0),
    shop_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("sales-management")),
):
    try:
        service = SalesManagementService(db, brand_key=brand_key)
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
            top_n=top_n,
            shop_id=shop_id,
        )
        return {"status": "success", "data": result}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=humanize_error(exc))


@router.get("/sales-management/shops")
def get_sales_shops(
    brand_key: str = Query("unbee"),
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("sales-management")),
):
    """Shop options for the shop filter (shop_id + display label)."""
    try:
        service = SalesManagementService(db, brand_key=brand_key)
        return {"status": "success", "data": service.get_shop_options()}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=humanize_error(exc))


@router.get("/sales-management/sync-status")
def get_sync_status(
    brand_key: str = Query("unbee"),
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("sales-management")),
):
    try:
        service = SalesManagementService(db, brand_key=brand_key)
        data = service.get_sync_status()
        return {"status": "success", "data": data}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=humanize_error(exc))


@router.post("/sales-management/sync-now")
def sync_now(
    brand_key: str = Query("unbee"),
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("sales-management", require_manage=True)),
):
    try:
        service = SalesManagementService(db, brand_key=brand_key)
        result = service.sync_now(user=user)
        return {"status": "success", "data": result}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=humanize_error(exc))


@router.post("/sales-management/sync-stock")
def sync_stock(
    brand_key: str = Query("unbee"),
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("sales-management", require_manage=True)),
):
    try:
        service = SalesManagementService(db, brand_key=brand_key)
        result = service.sync_product_stock()
        return {"status": "success", "data": result}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=humanize_error(exc))


@router.post("/sales-management/backfill")
def backfill_history(
    req: SalesBackfillRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("sales-management", require_manage=True)),
):
    try:
        service = SalesManagementService(db, brand_key=req.brand_key)
        result = service.backfill_history(
            user=user,
            time_start=req.time_start,
            time_end=req.time_end,
            chunk_hours=req.chunk_hours,
            max_chunks=req.max_chunks,
        )
        return {"status": "success", "data": result}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=humanize_error(exc))


@router.get("/sales-management/priority-codes")
def get_priority_codes(
    brand_key: str = Query("unbee"),
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("sales-management")),
):
    try:
        service = SalesManagementService(db, brand_key=brand_key)
        data = service.get_priority_codes()
        return {"status": "success", "data": data}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=humanize_error(exc))


@router.get("/sales-management/product-codes/search")
def search_product_codes(
    brand_key: str = Query("unbee"),
    keyword: Optional[str] = Query(None),
    limit: int = Query(30),
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("sales-management")),
):
    try:
        service = SalesManagementService(db, brand_key=brand_key)
        data = service.search_product_codes(keyword=keyword, limit=limit)
        return {"status": "success", "data": data}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=humanize_error(exc))


@router.get("/sales-management/product-planning/product-codes/search")
def search_product_codes_for_planning(
    keyword: Optional[str] = Query(None),
    limit: int = Query(30),
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("fabric-planning")),
):
    try:
        service = SalesManagementService(db)
        data = service.search_product_codes(keyword=keyword, limit=limit)
        return {"status": "success", "data": data}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=humanize_error(exc))


@router.post("/sales-management/product-planning/4w")
def get_product_planning_4w(
    req: ProductPlanning4WRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("fabric-planning")),
):
    try:
        service = SalesManagementService(db)
        data = service.get_product_planning_4w(
            codes=req.codes,
            anchor_time_ms=req.anchor_time_ms,
            weeks=req.weeks,
        )
        return {"status": "success", "data": data}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=humanize_error(exc))


@router.post("/sales-management/priority-codes")
def upsert_priority_codes(
    req: PriorityCodesUpsertRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("sales-management", require_manage=True)),
):
    try:
        service = SalesManagementService(db, brand_key=req.brand_key)
        result = service.save_priority_codes(
            codes=req.codes,
            user=user,
            mode=req.mode,
            note=req.note or "",
        )
        return {"status": "success", "data": result}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=humanize_error(exc))


@router.get("/sales-management/export")
def export_sales_report(
    brand_key: str = Query("unbee"),
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
    shop_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("sales-management")),
):
    try:
        service = SalesManagementService(db, brand_key=brand_key)
        rows = service.get_report_by_shop_for_export(
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
            shop_id=shop_id,
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
            "Shop",
            "Uu tien",
        ])
        for row in rows:
            ws.append([
                row.get("code", ""),
                row.get("name", ""),
                row.get("sold_qty", 0),
                row.get("sold_revenue", 0),
                row.get("current_stock", 0),
                row.get("channel", ""),
                row.get("shop_id", ""),
                "Yes" if row.get("is_priority") else "",
            ])

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)

        filename = "sales_report.xlsx"
        if time_start and time_end:
            filename = f"sales_report_{time_start}_{time_end}.xlsx"
        if shop_id:
            filename = filename.replace(".xlsx", f"_shop_{str(shop_id).strip()}.xlsx")

        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=humanize_error(exc))
