from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from sqlalchemy import text
from security import decode_access_token
from drivers.db_client import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token không hợp lệ hoặc đã hết hạn",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload 

def require_admin(user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Cần quyền Admin")
    return user


def get_user_module_permissions(user_id: int, db: Session):
    rows = db.execute(text("""
        SELECT module_key, can_view, can_manage
        FROM account_module_permissions
        WHERE user_id = :uid
    """), {"uid": user_id}).fetchall()
    return {
        r[0]: {
            "can_view": bool(r[1]),
            "can_manage": bool(r[2]),
        }
        for r in rows
    }


def has_module_access(user: dict, db: Session, module_key: str, require_manage: bool = False):
    # Admin full access
    if user.get("role") == "admin":
        return True

    # Theo yêu cầu nghiệp vụ: kho vật tư & kho xưởng được nhìn chung
    if module_key in ("inventory", "warehouses"):
        return True

    user_id = user.get("id")
    if not user_id:
        return False
    module_map = get_user_module_permissions(user_id, db)
    item = module_map.get(module_key)
    if not item:
        return False
    if require_manage:
        return item.get("can_manage", False)
    return item.get("can_view", False)


def require_module_access(module_key: str, require_manage: bool = False):
    def checker(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
        if not has_module_access(user, db, module_key, require_manage=require_manage):
            raise HTTPException(
                status_code=403,
                detail=f"Không có quyền truy cập module: {module_key}",
            )
        return user

    return checker

# --- LOGIC PHÂN QUYỀN MỚI (HỖ TRỢ NHIỀU KHO) ---
def get_allowed_warehouse_ids(user: dict, db: Session):
    role = user.get("role")
    user_id = user.get("id")

    # 1. Admin -> Full quyền
    if role == 'admin':
        return None 
    
    # 2. Lấy danh sách các kho được gán trực tiếp từ bảng user_permissions
    query_perms = text("SELECT warehouse_id FROM user_permissions WHERE user_id = :uid")
    assigned_warehouses = db.execute(query_perms, {"uid": user_id}).fetchall()
    
    # Nếu không được gán kho nào -> Rỗng
    if not assigned_warehouses:
        return []

    # Chỉ lấy đúng kho/xưởng đã được cấp trực tiếp cho tài khoản
    # (không tự nới rộng theo brand/kho tổng nữa).
    direct_ids = [int(row[0]) for row in assigned_warehouses]
    if not direct_ids:
        return []

    return list(set(direct_ids))


def get_allowed_central_ids(user: dict, db: Session):
    role = user.get("role")
    user_id = user.get("id")
    if role == "admin":
        return None
    if not user_id:
        return []
    rows = db.execute(text("""
        SELECT up.warehouse_id
        FROM user_permissions up
        JOIN warehouses w ON w.id = up.warehouse_id
        WHERE up.user_id = :uid
          AND w.is_central = 1
    """), {"uid": user_id}).fetchall()
    return [int(r[0]) for r in rows]


def assert_warehouse_scope(user: dict, db: Session, warehouse_id: int):
    allowed_ids = get_allowed_warehouse_ids(user, db)
    if allowed_ids is None:
        return
    if warehouse_id not in allowed_ids:
        raise HTTPException(status_code=403, detail="Không có quyền truy cập xưởng/kho này")


def assert_central_scope(user: dict, db: Session, central_id: int):
    row = db.execute(
        text("SELECT id, is_central FROM warehouses WHERE id = :id"),
        {"id": central_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy kho tổng")
    if not bool(row[1]):
        raise HTTPException(status_code=400, detail="owner_central_id phải là kho tổng")
    assert_warehouse_scope(user, db, int(row[0]))


def assert_production_order_scope(user: dict, db: Session, order_id: int):
    row = db.execute(
        text("SELECT warehouse_id, owner_central_id FROM production_orders WHERE id = :id"),
        {"id": order_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy lệnh sản xuất")
    assert_warehouse_scope(user, db, int(row[0]))
    owner_central_id = row[1]
    if owner_central_id is None:
        return
    allowed_central_ids = get_allowed_central_ids(user, db)
    if allowed_central_ids is None:
        return
    if int(owner_central_id) not in set(allowed_central_ids):
        raise HTTPException(status_code=403, detail="Không có quyền truy cập đơn của nhãn này")


def assert_receive_log_scope(user: dict, db: Session, log_id: int):
    row = db.execute(text("""
        SELECT l.production_order_id
        FROM production_receive_logs l
        JOIN production_orders po ON po.id = l.production_order_id
        WHERE l.id = :id
    """), {"id": log_id}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy log nhập hàng")
    assert_production_order_scope(user, db, int(row[0]))