# backend/main.py
from fastapi import FastAPI
from api import products

app = FastAPI(title="Fashion WMS API")

# Đăng ký các router (API endpoints)
app.include_router(products.router, prefix="/api/v1", tags=["Products"])

@app.get("/")
def health_check():
    return {"status": "ok", "system": "Fashion WMS Backend"}