from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from drivers.db_client import get_db

# --- QUAN TRỌNG: PHẢI CÓ 2 DÒNG IMPORT NÀY ---
from services.authService import AuthService 
from security import get_current_user 
# ---------------------------------------------

router = APIRouter()

# 1. Định nghĩa khuôn mẫu JSON gửi lên
class LoginRequest(BaseModel):
    username: str
    password: str

# 2. API Đăng nhập
@router.post("/auth/login")
def login(request: LoginRequest, db: Session = Depends(get_db)):
    # Bây giờ Python đã hiểu AuthService là gì nhờ dòng import bên trên
    service = AuthService(db)
    token = service.login(request.username, request.password)
    
    if not token:
        raise HTTPException(status_code=401, detail="Sai tài khoản hoặc mật khẩu")
    
    return token

# 3. API Lấy thông tin User hiện tại
@router.get("/auth/me")
def read_users_me(current_user: dict = Depends(get_current_user)):
    return current_user