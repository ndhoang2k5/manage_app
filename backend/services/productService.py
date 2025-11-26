from sqlalchemy.orm import Session
from sqlalchemy import text
from entities.product import MaterialCreateRequest, MaterialGroupCreateRequest

class ProductService:
    def __init__(self, db: Session):
        self.db = db

    # USE CASE 1: Tạo Nguyên vật liệu lẻ (Nhập tay SKU)
    def create_material(self, data: MaterialCreateRequest):
        try:
            # 1. Tìm hoặc tạo Product cha (Gom nhóm theo tên)
            # Logic: Nếu tên là "Cúc nhựa trắng" -> Product cha là "Cúc nhựa trắng" (Category mặc định 2: Phụ liệu)
            # Để đơn giản hóa, ta tạo Product cha dựa trên tên người dùng nhập
            
            # Kiểm tra Product cha đã tồn tại chưa
            query_parent = text("SELECT id FROM products WHERE name = :name LIMIT 1")
            parent = self.db.execute(query_parent, {"name": data.name}).fetchone()

            if parent:
                parent_id = parent[0]
            else:
                # Tạo mới Product cha
                query_insert_parent = text("""
                    INSERT INTO products (category_id, name, type, base_unit) 
                    VALUES (2, :name, 'material', :unit)
                """) # Mặc định category_id = 2 (Phụ liệu) cho nhanh
                self.db.execute(query_insert_parent, {"name": data.name, "unit": data.unit})
                self.db.commit()
                # Lấy ID vừa tạo
                parent_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            # 2. Tạo Variant (Chi tiết cụ thể - H10001)
            query_variant = text("""
                INSERT INTO product_variants (product_id, sku, variant_name, attributes, cost_price)
                VALUES (:pid, :sku, :vname, :attrs, :cost)
            """)
            self.db.execute(query_variant, {
                "pid": parent_id,
                "sku": data.sku,
                "vname": data.name, # Tên variant lấy theo tên nhập
                "attrs": data.attributes,
                "cost": data.cost_price
            })
            self.db.commit()
            return {"status": "success", "message": f"Đã tạo NVL: {data.sku} - {data.name}"}
        
        except Exception as e:
            self.db.rollback()
            raise Exception(f"Lỗi tạo NVL: {str(e)}")

    # USE CASE 2: Tạo Nhóm Nguyên vật liệu (Set)
    def create_material_group(self, data: MaterialGroupCreateRequest):
        try:
            # 1. Tạo Header nhóm (Bảng material_groups)
            query_group = text("""
                INSERT INTO material_groups (code, name, description)
                VALUES (:code, :name, :desc)
            """)
            self.db.execute(query_group, {
                "code": data.code,
                "name": data.name,
                "desc": data.description
            })
            self.db.commit() # Commit để lấy ID
            
            # Lấy ID nhóm vừa tạo
            group_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            # 2. Tạo Chi tiết nhóm (Vòng lặp insert từng món)
            query_detail = text("""
                INSERT INTO material_group_details (group_id, material_variant_id, quantity_standard)
                VALUES (:gid, :vid, :qty)
            """)
            
            for item in data.items:
                self.db.execute(query_detail, {
                    "gid": group_id,
                    "vid": item.material_variant_id,
                    "qty": item.quantity
                })
            
            self.db.commit()
            return {"status": "success", "message": f"Đã tạo nhóm NVL: {data.code} với {len(data.items)} chi tiết."}

        except Exception as e:
            self.db.rollback()
            raise Exception(f"Lỗi tạo nhóm: {str(e)}")

    # USE CASE 3: Lấy danh sách NVL (để hiển thị lên bảng)
    def get_all_materials(self):
        query = text("""
            SELECT v.id, v.sku, v.variant_name, p.name as category_name, 
                   IFNULL(SUM(s.quantity_on_hand), 0) as quantity_on_hand
            FROM product_variants v
            JOIN products p ON v.product_id = p.id
            LEFT JOIN inventory_stocks s ON v.id = s.product_variant_id
            WHERE p.type = 'material'
            GROUP BY v.id, v.sku, v.variant_name, p.name
            ORDER BY v.id DESC
        """)
        results = self.db.execute(query).fetchall()
        return [
            {
                "id": row[0], "sku": row[1], "variant_name": row[2], 
                "category_name": row[3], "quantity_on_hand": row[4]
            } for row in results
        ]