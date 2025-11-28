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

    # ... (Các phần trên giữ nguyên) ...

    # USE CASE 2: Tạo Nhóm Nguyên vật liệu (Set) - ĐÃ SỬA LỖI ID=0
    def create_material_group(self, data: MaterialGroupCreateRequest):
        try:
            # 1. Tạo Header nhóm
            query_group = text("""
                INSERT INTO material_groups (code, name, description)
                VALUES (:code, :name, :desc)
            """)
            self.db.execute(query_group, {
                "code": data.code,
                "name": data.name,
                "desc": data.description
            })
            
            # --- FIX QUAN TRỌNG: COMMIT LUÔN ĐỂ TẠO DÒNG TRONG DB ---
            self.db.commit() 
            
            # 2. Lấy ID vừa tạo bằng cách Query ngược lại theo MÃ (Code)
            # Cách này an toàn tuyệt đối 100%, không bao giờ bị trả về 0
            query_get_id = text("SELECT id FROM material_groups WHERE code = :code")
            row = self.db.execute(query_get_id, {"code": data.code}).fetchone()
            
            if not row:
                raise Exception("Lỗi: Không tìm thấy nhóm vừa tạo.")
                
            group_id = row[0] # Lấy ID chính xác (Ví dụ: 15)

            # 3. Tạo Chi tiết nhóm
            query_detail = text("""
                INSERT INTO material_group_details (group_id, material_variant_id, quantity_standard)
                VALUES (:gid, :vid, :qty)
            """)
            
            for item in data.items:
                self.db.execute(query_detail, {
                    "gid": group_id, # Lúc này ID chắc chắn đúng
                    "vid": item.material_variant_id,
                    "qty": item.quantity
                })
            
            self.db.commit() # Lưu nốt phần chi tiết
            return {"status": "success", "message": f"Đã tạo nhóm NVL: {data.code}"}

        except Exception as e:
            self.db.rollback()
            # Nếu lỗi duplicate entry (trùng mã) thì báo rõ
            if "Duplicate entry" in str(e):
                raise Exception(f"Mã nhóm '{data.code}' đã tồn tại. Vui lòng chọn mã khác.")
            raise Exception(f"Lỗi tạo nhóm: {str(e)}")

    # USE CASE 3: Lấy danh sách NVL (để hiển thị lên bảng)
    def get_all_materials(self):
        query = text("""
            SELECT v.id, v.sku, v.variant_name, p.name as category_name, 
                   IFNULL(SUM(s.quantity_on_hand), 0) as quantity_on_hand,
                   v.cost_price -- <--- QUAN TRỌNG: Lấy thêm cột này
            FROM product_variants v
            JOIN products p ON v.product_id = p.id
            LEFT JOIN inventory_stocks s ON v.id = s.product_variant_id
            WHERE p.type = 'material'
            GROUP BY v.id, v.sku, v.variant_name, p.name, v.cost_price
            ORDER BY v.id DESC
        """)
        results = self.db.execute(query).fetchall()
        return [
            {
                "id": row[0], 
                "sku": row[1], 
                "variant_name": row[2], 
                "category_name": row[3], 
                "quantity_on_hand": row[4], 
                "cost_price": row[5] # <--- Map dữ liệu ra
            } for row in results
        ]
    
    # 4. Lấy danh sách Nhóm NVL (Kèm chi tiết bên trong)
    def get_all_groups(self):
        # Lấy Header nhóm
        groups = self.db.execute(text("SELECT id, code, name, description FROM material_groups ORDER BY id DESC")).fetchall()
        
        result = []
        for g in groups:
            group_id = g[0]
            # Lấy chi tiết con của nhóm này
            details = self.db.execute(text("""
                SELECT pv.sku, pv.variant_name, mgd.quantity_standard
                FROM material_group_details mgd
                JOIN product_variants pv ON mgd.material_variant_id = pv.id
                WHERE mgd.group_id = :gid
            """), {"gid": group_id}).fetchall()
            
            items_list = [f"{d[1]} (x{d[2]})" for d in details] # Format: "Cúc (x5)"
            
            result.append({
                "id": group_id,
                "code": g[1],
                "name": g[2],
                "description": g[3],
                "items_summary": ", ".join(items_list) # Nối thành chuỗi để hiển thị gọn trên bảng
            })
            
        return result