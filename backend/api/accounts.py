from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from drivers.db_client import get_db
from drivers.dependencies import require_admin, get_current_user
from entities.account import (
    AccountCreateRequest,
    AccountUpdateRequest,
    ModulePermissionsUpdateRequest,
    ScopePermissionsUpdateRequest,
)
from services.accountService import AccountService

router = APIRouter()


@router.get("/accounts")
def list_accounts(
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    return AccountService(db).list_accounts()


@router.post("/accounts/create")
def create_account(
    req: AccountCreateRequest,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    service = AccountService(db)
    try:
        return service.create_account(req)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/accounts/{account_id}")
def update_account(
    account_id: int,
    req: AccountUpdateRequest,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    service = AccountService(db)
    try:
        return service.update_account(account_id, req)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/accounts/{account_id}")
def delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Cần quyền Admin")
    service = AccountService(db)
    try:
        return service.delete_account(account_id, current_user.get("id"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/accounts/{account_id}/permissions")
def get_account_permissions(
    account_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    service = AccountService(db)
    try:
        return service.get_account_permissions(account_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/accounts/{account_id}/permissions/modules")
def update_module_permissions(
    account_id: int,
    req: ModulePermissionsUpdateRequest,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    service = AccountService(db)
    try:
        return service.update_module_permissions(account_id, req.module_permissions)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/accounts/{account_id}/permissions/scopes")
def update_scope_permissions(
    account_id: int,
    req: ScopePermissionsUpdateRequest,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    service = AccountService(db)
    try:
        return service.update_scope_permissions(account_id, req.warehouse_ids)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
