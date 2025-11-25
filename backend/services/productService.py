# Xử lý logic liên quan đến:
# Tạo sản phẩm
# Tạo biến thể (SKU)
# Cập nhật giá, mô tả
# Tìm kiếm
# Đồng bộ dữ liệu sản phẩm
# backend/services/productService.py

from sqlalchemy.orm import Session
from sqlalchemy import text
from entities.product import VariantCreateRequest

class ProductService:
    def __init__(self, db: Session):
        self.db = db

    def create_material(self, data: VariantCreateRequest):
        # 1. Kiểm tra hoặc tạo Product cha (VD: "Cúc Áo") trước
        # Logic: Tìm theo tên, nếu chưa có thì insert
        
        # Tìm product cha id
        query_check_parent = text("SELECT id FROM products WHERE name = :name LIMIT 1")
        result = self.db.execute(query_check_parent, {"name": data.product_name}).fetchone()

        if result:
            parent_id = result[0]
        else:
            # Tạo mới Product cha nếu chưa có (Mặc định category_id=1 tạm thời)
            query_insert_parent = text("""
                INSERT INTO products (category_id, name, type, base_unit) 
                VALUES (1, :name, 'material', :unit)
            """)
            self.db.execute(query_insert_parent, {"name": data.product_name, "unit": data.base_unit})
            self.db.commit()
            
            # Lấy ID vừa tạo
            parent_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

        # 2. Tạo Variant con (VD: "H10001 - Cúc trắng")
        try:
            query_insert_variant = text("""
                INSERT INTO product_variants (product_id, sku, variant_name, attributes, cost_price)
                VALUES (:pid, :sku, :vname, :attrs, :price)
            """)
            self.db.execute(query_insert_variant, {
                "pid": parent_id,
                "sku": data.sku,
                "vname": data.variant_name,
                "attrs": data.attributes,
                "price": data.cost_price
            })
            self.db.commit()
            return {"status": "success", "message": f"Đã tạo {data.sku}"}
        except Exception as e:
            self.db.rollback()
            raise e

    def get_all_materials(self):
        # Query lấy danh sách hiển thị
        query = text("""
            SELECT v.id, v.sku, v.variant_name, p.name as category_name, 
                   IFNULL(SUM(s.quantity_on_hand), 0) as quantity_on_hand
            FROM product_variants v
            JOIN products p ON v.product_id = p.id
            LEFT JOIN inventory_stocks s ON v.id = s.product_variant_id
            GROUP BY v.id, v.sku, v.variant_name, p.name
        """)
        results = self.db.execute(query).fetchall()
        
        # Map kết quả SQL sang List Dictionaries
        return [
            {
                "id": row[0], 
                "sku": row[1], 
                "variant_name": row[2], 
                "category_name": row[3],
                "quantity_on_hand": row[4]
            } 
            for row in results
        ]