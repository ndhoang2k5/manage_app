# from sqlalchemy.orm import Session
# from sqlalchemy import text
# from datetime import datetime, timedelta
# from jose import jwt

# # Cấu hình bảo mật
# SECRET_KEY = "FASHION_WMS_SECRET_KEY_2025" # Chuỗi bí mật, không được lộ
# ALGORITHM = "HS256"
# ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # Token sống 7 ngày

# class AuthService:
#     def __init__(self, db: Session):
#         self.db = db

#     def login(self, username, password):
#         # 1. Tìm user trong DB
#         # (Lưu ý: Để đơn giản tôi đang so sánh pass thô, thực tế nên dùng verify hash)
#         query = text("SELECT id, username, full_name, role FROM users WHERE username = :u AND password = :p")
#         user = self.db.execute(query, {"u": username, "p": password}).fetchone()

#         if not user:
#             return None # Sai thông tin
        
#         # 2. Tạo Token
#         token_data = {
#             "sub": user[1],         # username
#             "id": user[0],          # user_id
#             "role": user[3],        # role
#             "name": user[2],        # Full name
#             "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
#         }
        
#         token = jwt.encode(token_data, SECRET_KEY, algorithm=ALGORITHM)
        
#         return {
#             "access_token": token,
#             "token_type": "bearer",
#             "user_info": {
#                 "id": user[0],
#                 "name": user[2],
#                 "role": user[3]
#             }
#         }