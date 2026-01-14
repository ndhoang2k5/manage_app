from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from drivers.db_client import get_db
from services.draftService import DraftService
from entities.draft import DraftCreateRequest, DraftUpdateRequest

router = APIRouter()

@router.get("/drafts")
def get_drafts(db: Session = Depends(get_db)):
    return DraftService(db).get_all()

@router.post("/drafts/create")
def create_draft(req: DraftCreateRequest, db: Session = Depends(get_db)):
    return DraftService(db).create(req)

@router.put("/drafts/{id}")
def update_draft(id: int, req: DraftUpdateRequest, db: Session = Depends(get_db)):
    return DraftService(db).update(id, req)

@router.delete("/drafts/{id}")
def delete_draft(id: int, db: Session = Depends(get_db)):
    return DraftService(db).delete(id)