# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware # <--- Thêm dòng này
from api import products, warehouses, purchases, production

app = FastAPI(title="Fashion WMS API")

# --- CẤU HÌNH CORS (CHO PHÉP FRONTEND GỌI VÀO) ---
origins = [
    "http://localhost:3000", # Port mặc định của React/Vite
    "http://localhost:5173", # Port mặc định khác của Vite
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

@app.get("/")
def health_check():
    return {"status": "ok", "system": "Fashion WMS Backend"}