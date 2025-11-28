from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from entities.production import BOMCreateRequest, ProductionOrderCreateRequest, QuickProductionRequest

class ProductionService:
    def __init__(self, db: Session):
        self.db = db

    # 1. Tạo Công thức (BOM) - GIỮ NGUYÊN
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

    # 2. Tạo Lệnh Sản Xuất (Thường) - GIỮ NGUYÊN
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

    # 3. Tạo Lệnh Sản Xuất NHANH - GIỮ NGUYÊN
    def create_quick_order(self, data: QuickProductionRequest):
        try:
            # BƯỚC 1: Tạo Sản phẩm Cha
            query_prod = text("INSERT INTO products (category_id, name, type, base_unit) VALUES (3, :name, 'finished_good', 'Cái')")
            self.db.execute(query_prod, {"name": data.new_product_name})
            pid = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            # BƯỚC 2: Tạo Biến thể
            query_var = text("""
                INSERT INTO product_variants (product_id, sku, variant_name, cost_price)
                VALUES (:pid, :sku, :name, 0)
            """)
            self.db.execute(query_var, {"pid": pid, "sku": data.new_product_sku, "name": data.new_product_name})
            product_variant_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            # BƯỚC 3: Tạo BOM
            query_bom = text("INSERT INTO bom (product_variant_id, name) VALUES (:pid, :name)")
            self.db.execute(query_bom, {"pid": product_variant_id, "name": f"Công thức {data.new_product_name}"})
            bom_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            query_bom_detail = text("INSERT INTO bom_materials (bom_id, material_variant_id, quantity_needed) VALUES (:bid, :mid, :qty)")
            for item in data.materials:
                self.db.execute(query_bom_detail, {"bid": bom_id, "mid": item.material_variant_id, "qty": item.quantity_needed})

            # BƯỚC 4: Tạo Lệnh SX
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

            if data.auto_start:
                return self.start_production(order_id)

            return {"status": "success", "message": "Đã tạo Mẫu mới & Lệnh SX thành công!"}

        except IntegrityError as e:
            self.db.rollback()
            if "Duplicate entry" in str(e):
                raise Exception(f"Lỗi: Mã SKU '{data.new_product_sku}' hoặc Mã lệnh đã tồn tại!")
            raise Exception(str(e))
        except Exception as e:
            self.db.rollback()
            raise e

    # 4. Bắt đầu SX & TRỪ KHO LUÔN (Logic Mới)
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
            """), {"pid": order[3]}).fetchall()

            if not bom_items: raise Exception("Sản phẩm này chưa có công thức (BOM)!")

            # Duyệt qua từng nguyên liệu để TRỪ KHO
            for item in bom_items:
                mat_id = item[0]
                qty_needed_per_unit = item[1]
                total_qty_needed = qty_needed_per_unit * order[4] 

                # Kiểm tra tồn kho
                stock = self.db.execute(text("""
                    SELECT quantity_on_hand
                    FROM inventory_stocks 
                    WHERE warehouse_id = :wid AND product_variant_id = :mid
                """), {"wid": order[2], "mid": mat_id}).fetchone()

                current_stock = stock[0] if stock else 0

                if current_stock < total_qty_needed:
                    raise Exception(f"Kho thiếu nguyên liệu ID {mat_id}. Cần {total_qty_needed}, chỉ còn {current_stock}")

                # --- THAY ĐỔI Ở ĐÂY: TRỪ TRỰC TIẾP QUANTITY_ON_HAND ---
                self.db.execute(text("""
                    UPDATE inventory_stocks 
                    SET quantity_on_hand = quantity_on_hand - :qty
                    WHERE warehouse_id = :wid AND product_variant_id = :mid
                """), {"qty": total_qty_needed, "wid": order[2], "mid": mat_id})

                # Ghi log "Xuất kho sản xuất" NGAY LẬP TỨC
                self.db.execute(text("""
                    INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id)
                    VALUES (:wid, :mid, 'production_out', :qty, :ref)
                """), {"wid": order[2], "mid": mat_id, "qty": -total_qty_needed, "ref": order_id})

                # Vẫn lưu vào bảng reservations để biết lệnh này đã dùng bao nhiêu (cho mục đích thống kê/kế toán sau này)
                # Nhưng về mặt kho bãi thì hàng đã biến mất rồi.
                self.db.execute(text("""
                    INSERT INTO production_material_reservations (production_order_id, material_variant_id, quantity_reserved)
                    VALUES (:oid, :mid, :qty)
                """), {"oid": order_id, "mid": mat_id, "qty": total_qty_needed})

            # Cập nhật trạng thái lệnh
            self.db.execute(text("UPDATE production_orders SET status = 'in_progress' WHERE id = :id"), {"id": order_id})
            self.db.commit()
            return {"status": "success", "message": "Đã xuất kho nguyên liệu & Bắt đầu sản xuất!"}

        except Exception as e:
            self.db.rollback()
            raise e

    # 5. Hoàn thành SX (Chỉ nhập thành phẩm) - LOGIC MỚI
    def finish_production(self, order_id: int):
        try:
            # Lấy thông tin lệnh
            order = self.db.execute(text("SELECT * FROM production_orders WHERE id = :id"), {"id": order_id}).fetchone()
            
            # --- BỎ ĐOẠN TRỪ NVL VÌ ĐÃ TRỪ Ở BƯỚC START RỒI ---
            
            # Chỉ Cộng kho Thành phẩm
            finished_product_id = order[3]
            qty_finished = order[4]

            self.db.execute(text("""
                INSERT INTO inventory_stocks (warehouse_id, product_variant_id, quantity_on_hand)
                VALUES (:wid, :pid, :qty)
                ON DUPLICATE KEY UPDATE quantity_on_hand = quantity_on_hand + :qty
            """), {"wid": order[2], "pid": finished_product_id, "qty": qty_finished})

            # Ghi log nhập kho thành phẩm
            self.db.execute(text("""
                INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id)
                VALUES (:wid, :pid, 'production_in', :qty, :ref)
            """), {"wid": order[2], "pid": finished_product_id, "qty": qty_finished, "ref": order_id})

            self.db.execute(text("UPDATE production_orders SET status = 'completed', quantity_finished = :qty WHERE id = :id"), 
                            {"qty": qty_finished, "id": order_id})

            self.db.commit()
            return {"status": "success", "message": "Sản xuất hoàn tất. Đã nhập kho thành phẩm."}
        except Exception as e:
            self.db.rollback()
            raise e

    # ... (Các hàm get_all giữ nguyên) ...
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