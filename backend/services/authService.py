from sqlalchemy.orm import Session
from sqlalchemy import text
from security import create_access_token
# Không cần import verify_password nữa để tránh lỗi loằng ngoằng

class AuthService:
    def __init__(self, db: Session):
        self.db = db

    def login(self, username, password):
        # 1. Cắt khoảng trắng thừa (An toàn)
        username = username.strip()
        password = password.strip()

        # 2. Tìm user trong DB
        query = text("SELECT id, username, full_name, role, warehouse_id, password FROM users WHERE username = :u")
        user = self.db.execute(query, {"u": username}).fetchone()

        # 3. DEBUG LOG (Để yên tâm)
        if user:
            print(f"LOG: Input='{password}' | DB='{user[5]}'")
        else:
            print(f"LOG: User '{username}' not found")

        # 4. KIỂM TRA ĐĂNG NHẬP (LOGIC TRỰC TIẾP)
        if not user:
            return None 
        
        db_password = user[5] # Cột password trong DB

        if password != db_password:
            print("LOG: Sai mật khẩu!")
            return None 
        
        print("LOG: Đăng nhập thành công! Đang tạo Token...")
        
        token_data = {
            "sub": user[1],
            "id": user[0],
            "role": user[3],
            "wid": user[4]
        }
        token = create_access_token(token_data)
        
        return {
            "access_token": token,
            "token_type": "bearer",
            "user_info": {
                "id": user[0],
                "username": user[1],
                "name": user[2],
                "role": user[3],
                "warehouse_id": user[4]
            }
        }