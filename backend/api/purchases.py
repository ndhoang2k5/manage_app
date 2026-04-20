from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from drivers.db_client import get_db
from services.purchaseService import PurchaseService
from drivers.dependencies import (
    get_current_user,
    require_module_access,
    get_allowed_warehouse_ids,
    assert_warehouse_scope,
    get_allowed_material_cost_brand_ids,
    assert_material_cost_brand_scope,
)
# Import đầy đủ các Entities
from entities.purchase import SupplierCreateRequest, PurchaseOrderCreateRequest, SupplierResponse, PurchaseUpdateRequest
from typing import List, Optional
from sqlalchemy import text

router = APIRouter()

# --- SUPPLIER APIs ---
@router.post("/suppliers/create")
def create_supplier(
    request: SupplierCreateRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("purchases", require_manage=True)),
):
    service = PurchaseService(db)
    try:
        return service.create_supplier(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/suppliers", response_model=list[SupplierResponse])
def list_suppliers(
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("purchases")),
):
    service = PurchaseService(db)
    return service.get_all_suppliers()

# --- PURCHASE ORDER APIs ---

# 1. Tạo mới
@router.post("/purchases/create")
def create_purchase_order(
    request: PurchaseOrderCreateRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("purchases", require_manage=True)),
):
    service = PurchaseService(db)
    try:
        assert_warehouse_scope(user, db, int(request.warehouse_id))
        brand_id = db.execute(
            text("SELECT brand_id FROM warehouses WHERE id = :wid"),
            {"wid": int(request.warehouse_id)},
        ).scalar()
        if brand_id is None:
            raise Exception("Không tìm thấy kho nhập hàng")
        assert_material_cost_brand_scope(user, db, int(brand_id))
        return service.create_purchase_order(request)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# 2. Lấy danh sách (List)
@router.get("/purchases")
def list_purchase_orders(
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("purchases")),
):
    service = PurchaseService(db)
    allowed_ids = get_allowed_warehouse_ids(user, db)
    allowed_cost_brand_ids = get_allowed_material_cost_brand_ids(user, db)
    return service.get_all_orders(
        search,
        allowed_warehouse_ids=allowed_ids,
        allowed_cost_brand_ids=allowed_cost_brand_ids,
    )

# 3. Lấy chi tiết 1 phiếu 
@router.get("/purchases/{po_id}")
def get_po_detail(
    po_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("purchases")),
):
    service = PurchaseService(db)
    try:
        scope_row = db.execute(text("""
            SELECT po.warehouse_id, w.brand_id
            FROM purchase_orders po
            JOIN warehouses w ON w.id = po.warehouse_id
            WHERE po.id = :id
        """), {"id": po_id}).fetchone()
        if not scope_row:
            raise Exception("Phiếu nhập không tồn tại")
        wid, brand_id = int(scope_row[0]), int(scope_row[1])
        assert_warehouse_scope(user, db, wid)
        assert_material_cost_brand_scope(user, db, brand_id)
        return service.get_po_detail(po_id)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
 
# 4. Cập nhật phiếu (PUT)
@router.put("/purchases/{po_id}")
def update_purchase_order(
    po_id: int,
    request: PurchaseUpdateRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("purchases", require_manage=True)),
):
    service = PurchaseService(db)
    try:
        scope_row = db.execute(text("""
            SELECT po.warehouse_id, w.brand_id
            FROM purchase_orders po
            JOIN warehouses w ON w.id = po.warehouse_id
            WHERE po.id = :id
        """), {"id": po_id}).fetchone()
        if not scope_row:
            raise Exception("Không tìm thấy phiếu nhập")
        wid, brand_id = int(scope_row[0]), int(scope_row[1])
        assert_warehouse_scope(user, db, wid)
        assert_material_cost_brand_scope(user, db, brand_id)
        return service.update_po(po_id, request)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# 5. Xóa Phiếu Nhập (Và hoàn tác kho)
@router.delete("/purchases/{po_id}")
def delete_purchase_order(
    po_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_module_access("purchases", require_manage=True)),
):
    service = PurchaseService(db)
    try:
        wid = db.execute(text("SELECT warehouse_id FROM purchase_orders WHERE id = :id"), {"id": po_id}).scalar()
        if wid is None:
            raise Exception("Phiếu nhập không tồn tại")
        assert_warehouse_scope(user, db, int(wid))
        return service.delete_purchase_order(po_id)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))