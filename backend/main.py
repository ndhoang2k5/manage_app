# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from api import products, warehouses, purchases, production, reports, auth
import os 

app = FastAPI(title="Fashion WMS API")

os.makedirs("static/images", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# --- CẤU HÌNH CORS (CHO PHÉP FRONTEND GỌI VÀO) ---
origins = [
    "http://localhost:3000", # Port mặc định của React/Vite
    "http://localhost:5173", # Port mặc định khác của Vite
    "http://45.117.177.181",      # <--- THÊM DÒNG NÀY (IP VPS - Frontend chạy port 80)
    "http://45.117.177.181:3000", # <--- THÊM DÒNG NÀY
    "http://ranbeevn.com",       # <--- THÊM
    "http://www.ranbeevn.com",   # <--- THÊM
    "*"                      # Hoặc để "*" để cho phép tất cả (chỉ dùng khi dev)
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# --------------------------------------------------

app.include_router(products.router, prefix="/api/v1", tags=["Products"])
app.include_router(warehouses.router, prefix="/api/v1", tags=["Warehouses"])
app.include_router(purchases.router, prefix="/api/v1", tags=["Purchasing"])
app.include_router(production.router, prefix="/api/v1", tags=["Production"])
app.include_router(reports.router, prefix="/api/v1", tags=["Reports"])
app.include_router(auth.router, prefix="/api/v1", tags=["Authentication"])
@app.get("/")
def health_check():
    return {"status": "ok", "system": "Fashion WMS Backend"}