from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from entities.production import BOMCreateRequest, ProductionOrderCreateRequest, QuickProductionRequest

class ProductionService:
    def __init__(self, db: Session):
        self.db = db

    # 1. Tạo Công thức (BOM)
    def create_bom(self, data: BOMCreateRequest):
        try:
            query_bom = text("INSERT INTO bom (product_variant_id, name) VALUES (:pid, :name)")
            self.db.execute(query_bom, {"pid": data.product_variant_id, "name": data.name})
            bom_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            query_detail = text("""
                INSERT INTO bom_materials (bom_id, material_variant_id, quantity_needed)
                VALUES (:bid, :mid, :qty)
            """)
            for item in data.materials:
                self.db.execute(query_detail, {
                    "bid": bom_id, 
                    "mid": item.material_variant_id, 
                    "qty": item.quantity_needed
                })
            
            self.db.commit()
            return {"status": "success", "message": "Đã tạo công thức thành công"}
        except Exception as e:
            self.db.rollback()
            raise e

    # 2. Tạo Lệnh Sản Xuất (Thường)
    def create_order(self, data: ProductionOrderCreateRequest):
        try:
            query = text("""
                INSERT INTO production_orders (code, warehouse_id, product_variant_id, quantity_planned, status, start_date, due_date)
                VALUES (:code, :wid, :pid, :qty, 'draft', :start, :due)
            """)
            self.db.execute(query, {
                "code": data.code,
                "wid": data.warehouse_id,
                "pid": data.product_variant_id,
                "qty": data.quantity_planned,
                "start": data.start_date,
                "due": data.due_date
            })
            self.db.commit()
            return {"status": "success", "message": f"Đã tạo lệnh sản xuất nháp: {data.code}"}
        except Exception as e:
            self.db.rollback()
            raise e

    # 3. Tạo Lệnh Sản Xuất NHANH (Quick Production) - LOGIC MỚI
    def create_quick_order(self, data: QuickProductionRequest):
        try:
            # BƯỚC 1: Tạo Sản phẩm Cha (Giả sử Category ID 3 là Thành phẩm)
            # Lưu ý: Nếu database bạn chưa có category id 3, nó sẽ lỗi 400. 
            # Đảm bảo bảng categories có ít nhất 3 dòng.
            query_prod = text("INSERT INTO products (category_id, name, type, base_unit) VALUES (3, :name, 'finished_good', 'Cái')")
            self.db.execute(query_prod, {"name": data.new_product_name})
            pid = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            # BƯỚC 2: Tạo Biến thể (Variant)
            query_var = text("""
                INSERT INTO product_variants (product_id, sku, variant_name, cost_price)
                VALUES (:pid, :sku, :name, 0)
            """)
            self.db.execute(query_var, {"pid": pid, "sku": data.new_product_sku, "name": data.new_product_name})
            product_variant_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            # BƯỚC 3: Tạo Công thức (BOM)
            query_bom = text("INSERT INTO bom (product_variant_id, name) VALUES (:pid, :name)")
            self.db.execute(query_bom, {"pid": product_variant_id, "name": f"Công thức {data.new_product_name}"})
            bom_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            # Lưu chi tiết BOM
            query_bom_detail = text("INSERT INTO bom_materials (bom_id, material_variant_id, quantity_needed) VALUES (:bid, :mid, :qty)")
            
            estimated_cost = 0
            for item in data.materials:
                self.db.execute(query_bom_detail, {"bid": bom_id, "mid": item.material_variant_id, "qty": item.quantity_needed})

            # BƯỚC 4: Tạo Lệnh Sản Xuất
            query_order = text("""
                INSERT INTO production_orders (code, warehouse_id, product_variant_id, quantity_planned, status, start_date, due_date)
                VALUES (:code, :wid, :pid, :qty, 'draft', :start, :due)
            """)
            self.db.execute(query_order, {
                "code": data.order_code,
                "wid": data.warehouse_id,
                "pid": product_variant_id,
                "qty": data.quantity_planned,
                "start": data.start_date,
                "due": data.due_date
            })
            order_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            self.db.commit()

            # BƯỚC 5: Auto Start (Quan trọng: Gọi hàm start_production ở bên dưới)
            if data.auto_start:
                return self.start_production(order_id) # Gọi hàm nội bộ và trả về kết quả luôn

            return {"status": "success", "message": "Đã tạo Mẫu mới & Lệnh SX thành công!"}

        except IntegrityError as e:
            self.db.rollback()
            # Kiểm tra xem có phải lỗi trùng lặp không
            if "Duplicate entry" in str(e):
                # Ném ra lỗi tiếng Việt dễ hiểu
                raise Exception(f"Lỗi: Mã SKU '{data.new_product_sku}' đã tồn tại trong hệ thống! Vui lòng chọn mã khác.")
            else:
                raise Exception(str(e))
        except Exception as e:
            self.db.rollback()
            raise e

    # 4. Bắt đầu SX & Giữ hàng
    def start_production(self, order_id: int):
        try:
            # Lấy thông tin lệnh
            order = self.db.execute(text("SELECT * FROM production_orders WHERE id = :id"), {"id": order_id}).fetchone()
            if not order: raise Exception("Không tìm thấy lệnh SX")
            
            # Lấy BOM
            bom_items = self.db.execute(text("""
                SELECT bm.material_variant_id, bm.quantity_needed 
                FROM bom_materials bm
                JOIN bom b ON bm.bom_id = b.id
                WHERE b.product_variant_id = :pid
                LIMIT 1
            """), {"pid": order[3]}).fetchall() # index 3 là product_variant_id

            if not bom_items: raise Exception("Sản phẩm này chưa có công thức (BOM)!")

            # Kiểm tra và Giữ hàng
            for item in bom_items:
                mat_id = item[0]
                qty_needed_per_unit = item[1]
                # index 4 là quantity_planned
                total_qty_needed = qty_needed_per_unit * order[4] 

                # Check kho
                stock = self.db.execute(text("""
                    SELECT quantity_on_hand, quantity_reserved 
                    FROM inventory_stocks 
                    WHERE warehouse_id = :wid AND product_variant_id = :mid
                """), {"wid": order[2], "mid": mat_id}).fetchone() # index 2 là warehouse_id

                current_stock = stock[0] if stock else 0
                reserved_stock = stock[1] if stock else 0
                available = current_stock - reserved_stock

                if available < total_qty_needed:
                    raise Exception(f"Kho thiếu nguyên liệu ID {mat_id}. Cần {total_qty_needed}, chỉ còn {available}")

                # Update giữ chỗ
                self.db.execute(text("""
                    UPDATE inventory_stocks SET quantity_reserved = quantity_reserved + :qty
                    WHERE warehouse_id = :wid AND product_variant_id = :mid
                """), {"qty": total_qty_needed, "wid": order[2], "mid": mat_id})

                # Ghi log
                self.db.execute(text("""
                    INSERT INTO production_material_reservations (production_order_id, material_variant_id, quantity_reserved)
                    VALUES (:oid, :mid, :qty)
                """), {"oid": order_id, "mid": mat_id, "qty": total_qty_needed})

            self.db.execute(text("UPDATE production_orders SET status = 'in_progress' WHERE id = :id"), {"id": order_id})
            self.db.commit()
            return {"status": "success", "message": "Đã giữ đủ nguyên liệu, bắt đầu sản xuất!"}

        except Exception as e:
            self.db.rollback()
            raise e

    # 5. Hoàn thành SX
    def finish_production(self, order_id: int):
        try:
            reservations = self.db.execute(text("""
                SELECT material_variant_id, quantity_reserved FROM production_material_reservations WHERE production_order_id = :oid
            """), {"oid": order_id}).fetchall()

            order = self.db.execute(text("SELECT * FROM production_orders WHERE id = :id"), {"id": order_id}).fetchone()
            
            # Trừ kho NVL
            for res in reservations:
                mat_id = res[0]
                qty_used = res[1]
                self.db.execute(text("""
                    UPDATE inventory_stocks SET quantity_on_hand = quantity_on_hand - :qty, quantity_reserved = quantity_reserved - :qty
                    WHERE warehouse_id = :wid AND product_variant_id = :mid
                """), {"qty": qty_used, "wid": order[2], "mid": mat_id})

                self.db.execute(text("""
                    INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id)
                    VALUES (:wid, :mid, 'production_out', :qty, :ref)
                """), {"wid": order[2], "mid": mat_id, "qty": -qty_used, "ref": order_id})

            # Cộng kho Thành phẩm
            finished_product_id = order[3]
            qty_finished = order[4]

            self.db.execute(text("""
                INSERT INTO inventory_stocks (warehouse_id, product_variant_id, quantity_on_hand)
                VALUES (:wid, :pid, :qty)
                ON DUPLICATE KEY UPDATE quantity_on_hand = quantity_on_hand + :qty
            """), {"wid": order[2], "pid": finished_product_id, "qty": qty_finished})

            self.db.execute(text("""
                INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id)
                VALUES (:wid, :pid, 'production_in', :qty, :ref)
            """), {"wid": order[2], "pid": finished_product_id, "qty": qty_finished, "ref": order_id})

            self.db.execute(text("UPDATE production_orders SET status = 'completed', quantity_finished = :qty WHERE id = :id"), 
                            {"qty": qty_finished, "id": order_id})

            self.db.commit()
            return {"status": "success", "message": "Sản xuất hoàn tất."}
        except Exception as e:
            self.db.rollback()
            raise e

    # 6. API Lấy danh sách
    def get_all_orders(self):
        query = text("""
            SELECT po.id, po.code, w.name as warehouse_name, p.variant_name as product_name,
                   po.quantity_planned, po.quantity_finished, po.status, po.start_date, po.due_date
            FROM production_orders po
            JOIN warehouses w ON po.warehouse_id = w.id
            JOIN product_variants p ON po.product_variant_id = p.id
            ORDER BY po.id DESC
        """)
        results = self.db.execute(query).fetchall()
        return [
            {
                "id": r[0], "code": r[1], "warehouse_name": r[2], "product_name": r[3],
                "quantity_planned": r[4], "quantity_finished": r[5], "status": r[6],
                "start_date": r[7], "due_date": r[8]
            } for r in results
        ]

    def get_all_boms(self):
        query = text("""
            SELECT b.id, b.name, p.variant_name as product_name
            FROM bom b
            JOIN product_variants p ON b.product_variant_id = p.id
            ORDER BY b.id DESC
        """)
        results = self.db.execute(query).fetchall()
        return [{"id": r[0], "name": r[1], "product_name": r[2]} for r in results]