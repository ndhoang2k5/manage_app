from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from sqlalchemy import text
from drivers.db_client import get_db

# Cấu hình bảo mật
SECRET_KEY = "FASHION_WMS_SECRET_KEY_2025" 
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

# --- SỬA LẠI 2 HÀM NÀY ĐỂ BỎ MÃ HÓA ---

def verify_password(plain_password, hashed_password):
    # So sánh trực tiếp chuỗi (Văn bản thường)
    return plain_password == hashed_password

def get_password_hash(password):
    # Không mã hóa gì cả, trả về nguyên xi
    return password

# --------------------------------------

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Không thể xác thực tài khoản",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = db.execute(text("SELECT * FROM users WHERE username = :u"), {"u": username}).fetchone()
    if user is None:
        raise credentials_exception
    
    return {"id": user[0], "username": user[1], "name": user[3], "role": user[4], "warehouse_id": user[5]}

def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Chỉ Admin mới có quyền này")
    return current_user