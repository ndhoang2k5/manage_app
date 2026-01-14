from sqlalchemy.orm import Session
from sqlalchemy import text

class DraftService:
    def __init__(self, db: Session):
        self.db = db

    def get_all(self):
        query = text("SELECT id, code, name, note, status, created_at FROM draft_orders ORDER BY id DESC")
        results = self.db.execute(query).fetchall()
        
        data = []
        for r in results:
            # Lấy ảnh
            imgs = self.db.execute(text("SELECT image_url FROM draft_order_images WHERE draft_order_id = :id"), {"id": r[0]}).fetchall()
            image_list = [i[0] for i in imgs]
            
            data.append({
                "id": r[0], "code": r[1], "name": r[2], "note": r[3], 
                "status": r[4], "created_at": r[5], "images": image_list
            })
        return data

    def create(self, data):
        try:
            # Tạo Header
            query = text("INSERT INTO draft_orders (code, name, note) VALUES (:code, :name, :note)")
            self.db.execute(query, {"code": data.code, "name": data.name, "note": data.note})
            draft_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            # Lưu ảnh
            if data.image_urls:
                q_img = text("INSERT INTO draft_order_images (draft_order_id, image_url) VALUES (:did, :url)")
                for url in data.image_urls:
                    self.db.execute(q_img, {"did": draft_id, "url": url})

            self.db.commit()
            return {"status": "success", "message": "Đã tạo mẫu dự kiến"}
        except Exception as e:
            self.db.rollback()
            raise e

    def update(self, id, data):
        try:
            # Update Header
            self.db.execute(text("UPDATE draft_orders SET code=:c, name=:n, note=:nt, status=:s WHERE id=:id"),
                            {"c": data.code, "n": data.name, "nt": data.note, "s": data.status, "id": id})
            
            # Update Ảnh (Xóa cũ thêm mới cho đơn giản)
            if data.image_urls:
                self.db.execute(text("DELETE FROM draft_order_images WHERE draft_order_id = :id"), {"id": id})
                q_img = text("INSERT INTO draft_order_images (draft_order_id, image_url) VALUES (:did, :url)")
                for url in data.image_urls:
                    self.db.execute(q_img, {"did": id, "url": url})

            self.db.commit()
            return {"status": "success", "message": "Đã cập nhật"}
        except Exception as e:
            self.db.rollback()
            raise e

    def delete(self, id):
        try:
            self.db.execute(text("DELETE FROM draft_order_images WHERE draft_order_id = :id"), {"id": id})
            self.db.execute(text("DELETE FROM draft_orders WHERE id = :id"), {"id": id})
            self.db.commit()
            return {"status": "success"}
        except Exception as e:
            self.db.rollback()
            raise e