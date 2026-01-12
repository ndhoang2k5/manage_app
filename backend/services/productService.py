from sqlite3 import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy import text
from entities.product import MaterialCreateRequest, MaterialGroupCreateRequest, MaterialUpdateRequest, ProductVariantResponse


class ProductService:
    def __init__(self, db: Session):
        self.db = db

     # USE CASE 1: Tạo Vật tư với Nhiều Màu
    def create_material(self, data: MaterialCreateRequest):
        try:
            # 1. Tạo Product Cha (Nếu chưa có)
            # (Logic cũ: Tìm theo tên, nếu không có thì tạo)
            query_check_parent = text("SELECT id FROM products WHERE name = :name LIMIT 1")
            parent = self.db.execute(query_check_parent, {"name": data.name}).fetchone()

            if parent:
                parent_id = parent[0]
            else:
                query_insert_parent = text("""
                    INSERT INTO products (category_id, name, type, base_unit) 
                    VALUES (2, :name, 'material', :unit)
                """)
                self.db.execute(query_insert_parent, {"name": data.name, "unit": data.unit})
                self.db.flush()
                
                # Lấy lại ID
                parent_row = self.db.execute(query_check_parent, {"name": data.name}).fetchone()
                parent_id = parent_row[0]

            # 2. Tạo từng Biến thể (Màu)
            query_variant = text("""
                INSERT INTO product_variants (product_id, sku, variant_name, color, cost_price, note)
                VALUES (:pid, :sku, :vname, :color, :cost, :note)
            """)

            for variant in data.variants:
                # Tự động ghép tên: "Vải Linen" + " - " + "Trắng"
                full_name = f"{data.name} - {variant.color_name}"
                
                self.db.execute(query_variant, {
                    "pid": parent_id,
                    "sku": variant.sku,
                    "vname": full_name, # Tên hiển thị đầy đủ
                    "color": variant.color_name,
                    "cost": variant.cost_price,
                    "note": variant.note
                })
            
            self.db.commit()
            return {"status": "success", "message": f"Đã tạo vật tư '{data.name}' với {len(data.variants)} màu."}
            
        except IntegrityError as e:
            self.db.rollback()
            raise Exception("Lỗi: Mã SKU bị trùng lặp!")
        except Exception as e:
            self.db.rollback()
            raise Exception(f"Lỗi tạo NVL: {str(e)}")
        


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
                   v.cost_price, v.note, v.color
            FROM product_variants v
            JOIN products p ON v.product_id = p.id
            LEFT JOIN inventory_stocks s ON v.id = s.product_variant_id
            WHERE p.type = 'material'
            GROUP BY v.id, v.sku, v.variant_name, p.name, v.cost_price, v.note, v.color
            ORDER BY v.id DESC
        """)
        results = self.db.execute(query).fetchall()
        return [
            {
                "id": row[0], "sku": row[1], "variant_name": row[2], 
                "category_name": row[3], "quantity_on_hand": row[4], 
                "cost_price": row[5], "note": row[6], "color": row[7] # Map color
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
    
    # USE CASE 4: Lấy danh sách tất cả sản phẩm (để chọn khi tạo lệnh sản xuất)
    def get_all(self):
        # Query lấy thông tin chi tiết bao gồm cả Màu và Ghi chú
        query = text("""
            SELECT v.id, v.sku, v.variant_name, v.cost_price, 
                   v.color, v.note,
                   IFNULL(SUM(s.quantity_on_hand), 0) as quantity_on_hand
            FROM product_variants v
            LEFT JOIN inventory_stocks s ON v.id = s.product_variant_id
            GROUP BY v.id, v.sku, v.variant_name, v.cost_price, v.color, v.note
            ORDER BY v.id DESC
        """)
        results = self.db.execute(query).fetchall()
        
        return [
            {
                "id": r[0], 
                "sku": r[1], 
                "variant_name": r[2], 
                "cost_price": float(r[3]) if r[3] else 0, 
                "color": r[4], 
                "note": r[5],
                "quantity_on_hand": float(r[6])
            } for r in results
        ]

    # USE CASE 5: Cập nhật thông tin NVL
    def update_material(self, material_id: int, data: MaterialUpdateRequest):
        try:
            # A. Lấy thông tin cũ để biết product_id (Cha)
            current = self.db.execute(text("SELECT product_id FROM product_variants WHERE id = :id"), {"id": material_id}).fetchone()
            if not current: raise Exception("Vật tư không tồn tại")
            parent_id = current[0]

            # B. Cập nhật bảng Variants (Con)
            query_var = text("""
                UPDATE product_variants 
                SET sku = :sku, variant_name = :name, attributes = :attrs, note = :note
                WHERE id = :id
            """)
            self.db.execute(query_var, {
                "sku": data.sku, "name": data.name, 
                "attrs": data.attributes, "note": data.note, 
                "id": material_id
            })

            # C. Cập nhật bảng Products (Cha) - Để sửa Đơn vị tính
            query_prod = text("UPDATE products SET base_unit = :unit WHERE id = :pid")
            self.db.execute(query_prod, {"unit": data.unit, "pid": parent_id})

            self.db.commit()
            return {"status": "success", "message": "Cập nhật thành công!"}

        except Exception as e:
            self.db.rollback()
            if "Duplicate entry" in str(e):
                raise Exception(f"Mã SKU '{data.sku}' đã tồn tại ở sản phẩm khác!")
            raise e

    # 7. Lấy danh sách vật tư theo kho (MỚI)
    def get_materials_by_warehouse(self, warehouse_id: int):
        query = text("""
            SELECT v.id, v.sku, v.variant_name, v.cost_price, 
                   v.color, v.note,
                   IFNULL(s.quantity_on_hand, 0) as quantity_on_hand
            FROM product_variants v
            LEFT JOIN inventory_stocks s ON v.id = s.product_variant_id AND s.warehouse_id = :wid
            JOIN products p ON v.product_id = p.id
            WHERE p.type = 'material' 
            -- AND IFNULL(s.quantity_on_hand, 0) > 0  <-- (Bỏ comment dòng này nếu chỉ muốn hiện cái có tồn kho)
            ORDER BY v.id DESC
        """)
        results = self.db.execute(query, {"wid": warehouse_id}).fetchall()
        
        return [
            {
                "id": r[0], "sku": r[1], "variant_name": r[2], 
                "cost_price": float(r[3]) if r[3] else 0, 
                "color": r[4], "note": r[5],
                "quantity_on_hand": float(r[6])
            } for r in results
        ]