from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from drivers.db_client import get_db
from services.draftService import DraftService
from entities.draft import DraftCreateRequest, DraftUpdateRequest
from drivers.dependencies import get_current_user # <-- THÊM

router = APIRouter()

# Thêm user: dict = Depends(get_current_user) vào tất cả các route
@router.get("/drafts")
def get_drafts(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    return DraftService(db).get_all()

@router.post("/drafts/create")
def create_draft(req: DraftCreateRequest, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    return DraftService(db).create(req)

@router.put("/drafts/{id}")
def update_draft(id: int, req: DraftUpdateRequest, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    return DraftService(db).update(id, req)

@router.delete("/drafts/{id}")
def delete_draft(id: int, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    return DraftService(db).delete(id)