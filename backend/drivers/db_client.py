import os
import time
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import OperationalError
from dotenv import load_dotenv

load_dotenv("local.env")

# Lấy thông tin từ biến môi trường
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "rootpassword")
DB_HOST = os.getenv("DB_HOST", "database")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_NAME = os.getenv("DB_NAME", "manage_app_database")

# Chuỗi kết nối
# Lưu ý: Đã thêm charset=utf8mb4
DATABASE_URL = f"mysql+mysqlconnector://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"

def create_db_engine(retries=10, delay=5):
    for i in range(retries):
        try:
            print(f"🔄 Đang thử kết nối Database lần {i+1}...")
            
            # --- FIX LỖI SSL TẠI ĐÂY ---
            # Thêm connect_args={"ssl_disabled": True} để bảo driver bỏ qua kiểm tra SSL
            engine = create_engine(
                DATABASE_URL, 
                pool_pre_ping=True,
                connect_args={"ssl_disabled": True} 
            )
            # ---------------------------

            with engine.connect() as connection:
                print("✅ Kết nối Database thành công!")
                return engine
        except OperationalError as e:
            print(f"⚠️ Lỗi kết nối (Thử lại sau {delay}s): {e}")
            time.sleep(delay)
    raise Exception("❌ Không thể kết nối tới Database sau nhiều lần thử.")

engine = create_db_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()