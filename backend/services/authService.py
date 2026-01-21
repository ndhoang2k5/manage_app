# --- START OF FILE authService.py ---
from sqlalchemy.orm import Session
from sqlalchemy import text
from security import verify_password, create_access_token, get_password_hash

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
        access_token = create_access_token(token_data)
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user_info": {
                "id": user_id,
                "name": full_name,
                "role": role,
                "warehouse_id": warehouse_id
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