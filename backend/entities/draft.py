from pydantic import BaseModel
from typing import List, Optional

class DraftCreateRequest(BaseModel):
    code: str
    name: str
    note: Optional[str] = ""
    image_urls: List[str] = []

class DraftUpdateRequest(BaseModel):
    code: str
    name: str
    note: Optional[str] = ""
    image_urls: List[str] = [] # Gửi danh sách ảnh mới (sẽ thay thế hoặc cộng thêm tùy logic)
    status: Optional[str] = "pending"