# (Quản lý sản xuất)
# Tạo lệnh sản xuất
# Trừ nguyên liệu (xuất kho)
# Tăng thành phẩm (nhập kho)
# Đánh dấu hoàn thành

from sqlalchemy.orm import Session
from sqlalchemy import text
from entities.production import BOMCreateRequest, ProductionOrderCreateRequest

class ProductionService:
    def __init__(self, db: Session):
        self.db = db

    # 1. Tạo Công thức (BOM)
    def create_bom(self, data: BOMCreateRequest):
        try:
            # Tạo Header BOM
            query_bom = text("INSERT INTO bom (product_variant_id, name) VALUES (:pid, :name)")
            self.db.execute(query_bom, {"pid": data.product_variant_id, "name": data.name})
            bom_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            # Tạo chi tiết
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

    # 2. Tạo Lệnh Sản Xuất (Bước 1: Mới chỉ Lên kế hoạch - Status: Draft)
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

    # 3. Bắt đầu sản xuất & Giữ chỗ nguyên liệu (Reservation) - QUAN TRỌNG
    def start_production(self, order_id: int):
        try:
            # A. Lấy thông tin lệnh
            order = self.db.execute(text("SELECT * FROM production_orders WHERE id = :id"), {"id": order_id}).fetchone()
            if not order: raise Exception("Không tìm thấy lệnh SX")
            
            # B. Lấy công thức (BOM) của sản phẩm này
            bom_items = self.db.execute(text("""
                SELECT bm.material_variant_id, bm.quantity_needed 
                FROM bom_materials bm
                JOIN bom b ON bm.bom_id = b.id
                WHERE b.product_variant_id = :pid
                LIMIT 1
            """), {"pid": order[2]}).fetchall() # index 2 là product_variant_id

            if not bom_items: raise Exception("Sản phẩm này chưa có công thức (BOM)!")

            # C. Kiểm tra và Giữ hàng
            for item in bom_items:
                mat_id = item[0]
                qty_needed_per_unit = item[1]
                total_qty_needed = qty_needed_per_unit * order[4] # index 4 là quantity_planned

                # Kiểm tra kho xem có đủ hàng không (Tồn thực - Đã giữ > Cần dùng)
                stock = self.db.execute(text("""
                    SELECT quantity_on_hand, quantity_reserved 
                    FROM inventory_stocks 
                    WHERE warehouse_id = :wid AND product_variant_id = :mid
                """), {"wid": order[2], "mid": mat_id}).fetchone() # index 2 là warehouse_id

                current_stock = stock[0] if stock else 0
                reserved_stock = stock[1] if stock else 0
                available = current_stock - reserved_stock

                if available < total_qty_needed:
                    raise Exception(f"Kho không đủ nguyên liệu ID {mat_id}. Cần {total_qty_needed}, chỉ còn {available}")

                # Nếu đủ -> Update tăng lượng giữ chỗ (Reservation)
                self.db.execute(text("""
                    UPDATE inventory_stocks 
                    SET quantity_reserved = quantity_reserved + :qty
                    WHERE warehouse_id = :wid AND product_variant_id = :mid
                """), {"qty": total_qty_needed, "wid": order[2], "mid": mat_id})

                # Ghi log giữ chỗ
                self.db.execute(text("""
                    INSERT INTO production_material_reservations (production_order_id, material_variant_id, quantity_reserved)
                    VALUES (:oid, :mid, :qty)
                """), {"oid": order_id, "mid": mat_id, "qty": total_qty_needed})

            # D. Update trạng thái lệnh sang 'in_progress'
            self.db.execute(text("UPDATE production_orders SET status = 'in_progress' WHERE id = :id"), {"id": order_id})
            
            self.db.commit()
            return {"status": "success", "message": "Đã giữ đủ nguyên liệu, bắt đầu sản xuất!"}

        except Exception as e:
            self.db.rollback()
            raise e

    # 4. Hoàn thành sản xuất (Finish)
    def finish_production(self, order_id: int):
        try:
            # A. Lấy lại thông tin các nguyên liệu đã giữ chỗ
            reservations = self.db.execute(text("""
                SELECT material_variant_id, quantity_reserved 
                FROM production_material_reservations 
                WHERE production_order_id = :oid
            """), {"oid": order_id}).fetchall()

            order = self.db.execute(text("SELECT * FROM production_orders WHERE id = :id"), {"id": order_id}).fetchone()
            
            # B. Trừ kho nguyên liệu thật sự
            for res in reservations:
                mat_id = res[0]
                qty_used = res[1]

                # Trừ cả on_hand và reserved
                self.db.execute(text("""
                    UPDATE inventory_stocks 
                    SET quantity_on_hand = quantity_on_hand - :qty,
                        quantity_reserved = quantity_reserved - :qty
                    WHERE warehouse_id = :wid AND product_variant_id = :mid
                """), {"qty": qty_used, "wid": order[2], "mid": mat_id})

                # Ghi log xuất kho SX
                self.db.execute(text("""
                    INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id)
                    VALUES (:wid, :mid, 'production_out', :qty, :ref)
                """), {"wid": order[2], "mid": mat_id, "qty": -qty_used, "ref": order_id})

            # C. Cộng kho thành phẩm (Quần/Áo)
            finished_product_id = order[3]
            qty_finished = order[4]

            # Upsert thành phẩm
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

            # D. Đổi trạng thái -> Completed
            self.db.execute(text("UPDATE production_orders SET status = 'completed', quantity_finished = :qty WHERE id = :id"), 
                            {"qty": qty_finished, "id": order_id})

            self.db.commit()
            return {"status": "success", "message": "Sản xuất hoàn tất. Đã nhập kho thành phẩm."}

        except Exception as e:
            self.db.rollback()
            raise e
        
    # 5. Lấy danh sách lệnh sản xuất    
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

    # 6. Lấy danh sách BOM (Công thức)
    def get_all_boms(self):
        query = text("""
            SELECT b.id, b.name, p.variant_name as product_name
            FROM bom b
            JOIN product_variants p ON b.product_variant_id = p.id
            ORDER BY b.id DESC
        """)
        results = self.db.execute(query).fetchall()
        return [{"id": r[0], "name": r[1], "product_name": r[2]} for r in results]