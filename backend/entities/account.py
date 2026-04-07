from pydantic import BaseModel
from typing import List, Optional


class ModulePermissionItem(BaseModel):
    module_key: str
    can_view: bool = True
    can_manage: bool = False


class AccountCreateRequest(BaseModel):
    username: str
    password: str
    full_name: str
    role: str = "staff"
    warehouse_ids: List[int] = []
    module_permissions: List[ModulePermissionItem] = []


class AccountUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    warehouse_ids: Optional[List[int]] = None
    module_permissions: Optional[List[ModulePermissionItem]] = None


class ModulePermissionsUpdateRequest(BaseModel):
    module_permissions: List[ModulePermissionItem]


class ScopePermissionsUpdateRequest(BaseModel):
    warehouse_ids: List[int]
