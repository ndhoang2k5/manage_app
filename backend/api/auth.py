from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from drivers.db_client import get_db
from services.authService import AuthService 
from drivers.dependencies import get_current_user
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter()


class RegisterRequest(BaseModel):
    username: str
    password: str
    full_name: str
    role: str 
    warehouse_ids: Optional[List[int]] = []

# 1. API Đăng nhập (Dùng OAuth2 Form Data)
@router.post("/auth/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    service = AuthService(db)
    token = service.login(form_data.username, form_data.password)
    
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sai tài khoản hoặc mật khẩu",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token

@router.get("/auth/me")
def read_users_me(current_user: dict = Depends(get_current_user)):
    return current_user

@router.post("/auth/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    service = AuthService(db)
    try:
        # Gọi hàm create_user mới (sẽ sửa ở bước 4)
        return service.create_user(
            req.username, 
            req.password, 
            req.full_name, 
            req.role, 
            req.warehouse_ids # Truyền list
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))