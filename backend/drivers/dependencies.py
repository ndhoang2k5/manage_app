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

    # Danh sách ID kho gốc được gán (VD: [1, 6] tức là Unbee và Ranbee)
    direct_ids = [row[0] for row in assigned_warehouses]
    final_allowed_ids = set()

    for wh_id in direct_ids:
        # Lấy thông tin kho
        wh_info = db.execute(text("SELECT is_central, brand_id FROM warehouses WHERE id = :id"), {"id": wh_id}).fetchone()
        if not wh_info: continue
        
        is_central, brand_id = wh_info

        if is_central:
            children = db.execute(text("SELECT id FROM warehouses WHERE brand_id = :bid"), {"bid": brand_id}).fetchall()
            for child in children:
                final_allowed_ids.add(child[0])
        else:
            final_allowed_ids.add(wh_id)

    return list(final_allowed_ids)