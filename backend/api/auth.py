# from fastapi import APIRouter, Depends, HTTPException
# from sqlalchemy.orm import Session
# from pydantic import BaseModel
# from drivers.db_client import get_db
# from services.authService import AuthService

# router = APIRouter()

# class LoginRequest(BaseModel):
#     username: str
#     password: str

# @router.post("/auth/login")
# def login(request: LoginRequest, db: Session = Depends(get_db)):
#     service = AuthService(db)
#     token = service.login(request.username, request.password)
#     if not token:
#         raise HTTPException(status_code=401, detail="Sai tên đăng nhập hoặc mật khẩu")
#     return token