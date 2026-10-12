from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session

from drivers.db_client import get_db
from drivers.dependencies import require_admin
from drivers.error_messages import humanize_error
from services.apiKeyService import ApiKeyService
from services.integrationService import IntegrationService, paginate, parse_updated_since

router = APIRouter()

api_key_scheme = HTTPBearer(auto_error=False, description="Khóa API chỉ đọc (gmk_...)")

DEFAULT_PAGE_SIZE = 500
MAX_PAGE_SIZE = 2000


def require_read_api_key(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(api_key_scheme),
    db: Session = Depends(get_db),
):
    key = ApiKeyService(db).verify_key(credentials.credentials) if credentials else None
    if not key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Khóa API không hợp lệ hoặc đã bị thu hồi",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return key


def _list_params(
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    updated_since: Optional[str] = Query(None, description="ISO 8601, VD 2026-10-08T09:00:00+07:00"),
):
    try:
        since = parse_updated_since(updated_since)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"page": page, "page_size": page_size, "updated_since": since}


# --- Dữ liệu chỉ đọc (khóa API) ---
@router.get("/bom")
def integration_bom(
    params: dict = Depends(_list_params),
    latest_only: bool = Query(True, description="true: mỗi mã SP chỉ lấy lệnh gần nhất"),
    db: Session = Depends(get_db),
    key: dict = Depends(require_read_api_key),
):
    rows = IntegrationService(db, key["brand_ids"]).get_bom(latest_only, params["updated_since"])
    return paginate(rows, params["page"], params["page_size"])


@router.get("/gia-von")
def integration_cost(
    params: dict = Depends(_list_params),
    latest_only: bool = Query(True, description="true: mỗi mã SP chỉ lấy lệnh gần nhất"),
    db: Session = Depends(get_db),
    key: dict = Depends(require_read_api_key),
):
    rows = IntegrationService(db, key["brand_ids"]).get_cost(latest_only, params["updated_since"])
    return paginate(rows, params["page"], params["page_size"])


@router.get("/npl")
def integration_npl(
    params: dict = Depends(_list_params),
    db: Session = Depends(get_db),
    key: dict = Depends(require_read_api_key),
):
    rows = IntegrationService(db, key["brand_ids"]).get_npl(params["updated_since"])
    return paginate(rows, params["page"], params["page_size"])


@router.get("/lenh-sx")
def integration_production_orders(
    params: dict = Depends(_list_params),
    db: Session = Depends(get_db),
    key: dict = Depends(require_read_api_key),
):
    rows = IntegrationService(db, key["brand_ids"]).get_production_orders(params["updated_since"])
    return paginate(rows, params["page"], params["page_size"])


@router.get("/nhap-xuat-vat-tu")
def integration_material_movements(
    params: dict = Depends(_list_params),
    tieu_hao: bool = Query(False, description="true: thêm dòng 'xưởng dùng cho lệnh' (NVL xưởng xuất cho từng lệnh)"),
    db: Session = Depends(get_db),
    key: dict = Depends(require_read_api_key),
):
    rows = IntegrationService(db, key["brand_ids"]).get_material_movements(params["updated_since"], tieu_hao)
    return paginate(rows, params["page"], params["page_size"])


@router.get("/nhap-hang")
def integration_purchases(
    params: dict = Depends(_list_params),
    db: Session = Depends(get_db),
    key: dict = Depends(require_read_api_key),
):
    rows = IntegrationService(db, key["brand_ids"]).get_purchases(params["updated_since"])
    return paginate(rows, params["page"], params["page_size"])


@router.get("/nhap-kho-thanh-pham")
def integration_finished_receipts(
    params: dict = Depends(_list_params),
    db: Session = Depends(get_db),
    key: dict = Depends(require_read_api_key),
):
    rows = IntegrationService(db, key["brand_ids"]).get_finished_receipts(params["updated_since"])
    return paginate(rows, params["page"], params["page_size"])


# --- Quản lý khóa API (admin) ---
class ApiKeyCreateRequest(BaseModel):
    name: str
    brand_ids: Optional[List[int]] = None


@router.get("/integration/api-keys")
def list_api_keys(db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return ApiKeyService(db).list_keys()


@router.post("/integration/api-keys")
def create_api_key(req: ApiKeyCreateRequest, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    try:
        return ApiKeyService(db).create_key(req.name, req.brand_ids, created_by=admin.get("id"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=humanize_error(e))


@router.post("/integration/api-keys/{key_id}/revoke")
def revoke_api_key(key_id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    try:
        return ApiKeyService(db).revoke_key(key_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=humanize_error(e))
