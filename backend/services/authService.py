# --- START OF FILE authService.py ---
from datetime import timedelta
from sqlalchemy.orm import Session
from sqlalchemy import text
from security import (
    verify_password,
    create_access_token,
    get_password_hash,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)

class AuthService:
    def __init__(self, db: Session):
        self.db = db

    def login(self, username, password):
        # 1. Tìm user trong DB
        query = text("SELECT id, username, full_name, role, warehouse_id, password FROM users WHERE username = :u")
        user = self.db.execute(query, {"u": username}).fetchone()

        if not user:
            return None # Sai user
        
        user_id, db_username, full_name, role, warehouse_id, db_password_hash = user

        # 2. Kiểm tra Password (Hỗ trợ cả hash và plain text cũ)
        is_valid = False
        try:
            is_valid = verify_password(password, db_password_hash)
        except:
            # Fallback cho mật khẩu cũ chưa mã hóa (sau này nên bỏ)
            if password == db_password_hash:
                is_valid = True
                # Tự động cập nhật hash cho lần sau (Optional)
                new_hash = get_password_hash(password)
                self.db.execute(text("UPDATE users SET password = :p WHERE id = :id"), {"p": new_hash, "id": user_id})
                self.db.commit()

        if not is_valid:
            return None # Sai pass

        # 3. Tạo Token chứa Scope
        token_data = {
            "sub": db_username,
            "id": user_id,
            "role": role,
            "wid": warehouse_id # Quan trọng để phân quyền
        }
        access_token = create_access_token(
            token_data,
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        )

        module_rows = self.db.execute(text("""
            SELECT module_key, can_view, can_manage
            FROM account_module_permissions
            WHERE user_id = :uid
            ORDER BY module_key
        """), {"uid": user_id}).fetchall()
        module_permissions = [
            {
                "module_key": r[0],
                "can_view": bool(r[1]),
                "can_manage": bool(r[2]),
            }
            for r in module_rows
        ]
        permitted_modules = [m["module_key"] for m in module_permissions if m["can_view"]]

        wh_rows = self.db.execute(
            text("SELECT warehouse_id FROM user_permissions WHERE user_id = :uid"),
            {"uid": user_id},
        ).fetchall()
        warehouse_ids = [r[0] for r in wh_rows]
        try:
            brand_rows = self.db.execute(text("""
                SELECT brand_id
                FROM account_material_cost_brand_permissions
                WHERE user_id = :uid
                ORDER BY brand_id
            """), {"uid": user_id}).fetchall()
            material_cost_brand_ids = [int(r[0]) for r in brand_rows]
        except Exception:
            # Backward compatibility when table is not created yet.
            material_cost_brand_ids = []
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user_info": {
                "id": user_id,
                "name": full_name,
                "role": role,
                "warehouse_id": warehouse_id,
                "warehouse_ids": warehouse_ids,
                "module_permissions": module_permissions,
                "permitted_modules": permitted_modules,
                "material_cost_brand_ids": material_cost_brand_ids,
            }
        }
    
    # Sửa hàm create_user
    def create_user(self, username, password, full_name, role, warehouse_ids=None):
        try:
            # 1. Check tồn tại
            check = self.db.execute(text("SELECT id FROM users WHERE username = :u"), {"u": username}).fetchone()
            if check: raise Exception("User đã tồn tại")

            hashed_password = get_password_hash(password)

            # 2. Tạo User (Bỏ qua cột warehouse_id cũ hoặc để NULL)
            query_user = text("""
                INSERT INTO users (username, password, full_name, role)
                VALUES (:u, :p, :name, :role)
            """)
            self.db.execute(query_user, {
                "u": username, "p": hashed_password, "name": full_name, "role": role
            })
            
            # Lấy ID vừa tạo
            user_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            # 3. Lưu quyền vào bảng user_permissions
            if warehouse_ids and len(warehouse_ids) > 0:
                query_perm = text("INSERT INTO user_permissions (user_id, warehouse_id) VALUES (:uid, :wid)")
                for wid in warehouse_ids:
                    self.db.execute(query_perm, {"uid": user_id, "wid": wid})

            self.db.commit()
            return {"status": "success", "message": f"Đã tạo user {username}"}
        except Exception as e:
            self.db.rollback()
            raise e