import os
import time
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import OperationalError, DatabaseError # Import thêm DatabaseError
from dotenv import load_dotenv

load_dotenv("local.env")

# Lấy thông tin từ biến môi trường
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "rootpassword")
DB_HOST = os.getenv("DB_HOST", "database")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_NAME = os.getenv("DB_NAME", "manage_app_database")

# Chuỗi kết nối
DATABASE_URL = f"mysql+mysqlconnector://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"

def create_db_engine(retries=15, delay=5): # Tăng số lần thử lên 15
    for i in range(retries):
        try:
            print(f"🔄 [Lần {i+1}/{retries}] Đang kết nối tới {DB_HOST}...")
            
            engine = create_engine(
                DATABASE_URL, 
                pool_pre_ping=True,
                # Quan trọng: Tắt SSL để tránh lỗi self-signed certificate
                connect_args={"ssl_disabled": True} 
            )

            # Thử kết nối thực tế
            with engine.connect() as connection:
                print("✅ KẾT NỐI DATABASE THÀNH CÔNG!")
                return engine
                
        except Exception as e: # Bắt tất cả mọi lỗi (bao gồm cả lỗi 2003)
            print(f"⚠️ Kết nối thất bại: {e}")
            print(f"⏳ Đợi {delay} giây rồi thử lại...")
            time.sleep(delay)
            
    raise Exception("❌ KHÔNG THỂ KẾT NỐI DATABASE SAU NHIỀU LẦN THỬ.")

# Khởi tạo engine
engine = create_db_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()