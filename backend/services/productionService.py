from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from entities.production import BOMCreateRequest, ProductionOrderCreateRequest, QuickProductionRequest, ReceiveGoodsRequest

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

    # 3. Tạo Lệnh Sản Xuất NHANH (Hỗ trợ Size Breakdown)
    def create_quick_order(self, data: QuickProductionRequest):
        try:
            # Tính tổng số lượng
            if hasattr(data, 'size_breakdown') and data.size_breakdown:
                total_planned = sum(item.quantity for item in data.size_breakdown)
            else:
                total_planned = data.quantity_planned

            # BƯỚC 1, 2, 3: Tạo SP, Variant, BOM (GIỮ NGUYÊN)
            query_prod = text("INSERT INTO products (category_id, name, type, base_unit) VALUES (3, :name, 'finished_good', 'Cái')")
            self.db.execute(query_prod, {"name": data.new_product_name})
            pid = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            query_var = text("""
                INSERT INTO product_variants (product_id, sku, variant_name, cost_price)
                VALUES (:pid, :sku, :name, 0)
            """)
            self.db.execute(query_var, {"pid": pid, "sku": data.new_product_sku, "name": data.new_product_name})
            product_variant_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            query_bom = text("INSERT INTO bom (product_variant_id, name) VALUES (:pid, :name)")
            self.db.execute(query_bom, {"pid": product_variant_id, "name": f"Công thức {data.new_product_name}"})
            bom_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            query_bom_detail = text("INSERT INTO bom_materials (bom_id, material_variant_id, quantity_needed) VALUES (:bid, :mid, :qty)")
            for item in data.materials:
                self.db.execute(query_bom_detail, {"bid": bom_id, "mid": item.material_variant_id, "qty": item.quantity_needed})

            # BƯỚC 4: Tạo Lệnh SX (CẬP NHẬT: Thêm shipping_fee, other_fee)
            query_order = text("""
                INSERT INTO production_orders (code, warehouse_id, product_variant_id, quantity_planned, status, start_date, due_date, shipping_fee, other_fee)
                VALUES (:code, :wid, :pid, :qty, 'draft', :start, :due, :ship, :other)
            """)
            self.db.execute(query_order, {
                "code": data.order_code,
                "wid": data.warehouse_id,
                "pid": product_variant_id,
                "qty": total_planned,
                "start": data.start_date,
                "due": data.due_date,
                "ship": data.shipping_fee, # Mới
                "other": data.other_fee    # Mới
            })
            order_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            # BƯỚC 5: Lưu Size (GIỮ NGUYÊN)
            if hasattr(data, 'size_breakdown') and data.size_breakdown:
                query_size = text("""
                    INSERT INTO production_order_items (production_order_id, size_label, quantity_planned, quantity_finished, note)
                    VALUES (:oid, :size, :qty, 0, :note)
                """)
                for item in data.size_breakdown:
                    self.db.execute(query_size, {
                        "oid": order_id, "size": item.size, "qty": item.quantity, "note": item.note if item.note else ""
                    })

            # BƯỚC 6: Lưu Ảnh (GIỮ NGUYÊN)
            if hasattr(data, 'image_urls') and data.image_urls:
                query_img = text("INSERT INTO production_order_images (production_order_id, image_url) VALUES (:oid, :url)")
                for url in data.image_urls:
                    self.db.execute(query_img, {"oid": order_id, "url": url})

            self.db.commit()

            if data.auto_start:
                return self.start_production(order_id)

            return {"status": "success", "message": "Đã tạo Mẫu & Lệnh SX thành công!"}

        except IntegrityError as e:
            self.db.rollback()
            if "Duplicate entry" in str(e):
                raise Exception(f"Lỗi: Mã SKU hoặc Mã lệnh đã tồn tại!")
            raise Exception(str(e))
        except Exception as e:
            self.db.rollback()
            raise e

    # 4. Bắt đầu SX (Trừ kho NVL LUÔN)
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
                total_qty_needed = qty_needed_per_unit * order[4] # Định mức * Tổng SL

                # Kiểm tra tồn kho
                stock = self.db.execute(text("""
                    SELECT quantity_on_hand
                    FROM inventory_stocks 
                    WHERE warehouse_id = :wid AND product_variant_id = :mid
                """), {"wid": order[2], "mid": mat_id}).fetchone()

                current_stock = stock[0] if stock else 0

                if current_stock < total_qty_needed:
                    raise Exception(f"Kho thiếu nguyên liệu ID {mat_id}. Cần {total_qty_needed}, chỉ còn {current_stock}")

                # --- TRỪ TRỰC TIẾP QUANTITY_ON_HAND ---
                self.db.execute(text("""
                    UPDATE inventory_stocks 
                    SET quantity_on_hand = quantity_on_hand - :qty
                    WHERE warehouse_id = :wid AND product_variant_id = :mid
                """), {"qty": total_qty_needed, "wid": order[2], "mid": mat_id})

                # Ghi log xuất kho
                self.db.execute(text("""
                    INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id)
                    VALUES (:wid, :mid, 'production_out', :qty, :ref)
                """), {"wid": order[2], "mid": mat_id, "qty": -total_qty_needed, "ref": order_id})

                # Vẫn lưu vào bảng reservations để tham chiếu thống kê
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

    # 5. NHẬP KHO THÀNH PHẨM TỪNG ĐỢT (Receive Goods)
    def receive_goods(self, order_id: int, data: ReceiveGoodsRequest):
        try:
            # ... (Phần lấy thông tin lệnh giữ nguyên) ...
            order = self.db.execute(text("SELECT * FROM production_orders WHERE id = :id"), {"id": order_id}).fetchone()
            if not order: raise Exception("Không tìm thấy lệnh")
            
            pid = order[3]
            wid = order[2]
            total_received_now = 0

            for item in data.items:
                if item.quantity <= 0: continue

                # A. Update số lượng đã xong (Giữ nguyên)
                if item.id:
                    self.db.execute(text("UPDATE production_order_items SET quantity_finished = quantity_finished + :qty WHERE id = :item_id"), {"qty": item.quantity, "item_id": item.id})
                    
                    # --- MỚI: GHI LOG LỊCH SỬ ---
                    self.db.execute(text("""
                        INSERT INTO production_receive_logs (production_order_id, production_order_item_id, quantity)
                        VALUES (:oid, :item_id, :qty)
                    """), {"oid": order_id, "item_id": item.id, "qty": item.quantity})
                    # ---------------------------
                else:
                    raise Exception("Thiếu ID dòng size")

                # B. Cộng kho thành phẩm (Giữ nguyên)
                self.db.execute(text("""
                    INSERT INTO inventory_stocks (warehouse_id, product_variant_id, quantity_on_hand)
                    VALUES (:wid, :pid, :qty)
                    ON DUPLICATE KEY UPDATE quantity_on_hand = quantity_on_hand + :qty
                """), {"wid": wid, "pid": pid, "qty": item.quantity})

                total_received_now += item.quantity

            # C. Update Header & Ghi Transaction (Giữ nguyên)
            self.db.execute(text("UPDATE production_orders SET quantity_finished = quantity_finished + :qty WHERE id = :id"), {"qty": total_received_now, "id": order_id})
            
            self.db.execute(text("""
                INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id, note)
                VALUES (:wid, :pid, 'production_in', :qty, :ref, :note)
            """), {"wid": wid, "pid": pid, "qty": total_received_now, "ref": order_id, "note": f"Trả hàng đợt: {total_received_now}"})

            self.db.commit()
            return {"status": "success", "message": f"Đã nhập {total_received_now} SP và lưu lịch sử."}

        except Exception as e:
            self.db.rollback()
            raise e

    # --- HÀM MỚI: LẤY LỊCH SỬ TRẢ HÀNG ---
    def get_receive_history(self, order_id: int):
        query = text("""
            SELECT 
                l.received_at,
                i.size_label,
                i.note as size_note,
                l.quantity
            FROM production_receive_logs l
            JOIN production_order_items i ON l.production_order_item_id = i.id
            WHERE l.production_order_id = :oid
            ORDER BY l.received_at DESC
        """)
        results = self.db.execute(query, {"oid": order_id}).fetchall()
        
        return [
            {
                "date": r[0].strftime("%Y-%m-%d %H:%M"), # Format ngày giờ đẹp
                "size": r[1],
                "note": r[2],
                "quantity": r[3]
            } for r in results
        ]

    # 6. HÀM CHỐT ĐƠN (Force Finish)
    def force_finish_order(self, order_id: int):
        self.db.execute(text("UPDATE production_orders SET status = 'completed' WHERE id = :id"), {"id": order_id})
        self.db.commit()
        return {"status": "success", "message": "Đã chốt hoàn thành đơn hàng."}

    # 7. API LẤY CHI TIẾT SIZE
    def get_order_details(self, order_id: int):
        results = self.db.execute(text("""
            SELECT id, size_label, quantity_planned, quantity_finished 
            FROM production_order_items 
            WHERE production_order_id = :oid
        """), {"oid": order_id}).fetchall()
        return [{"id": r[0], "size": r[1], "planned": r[2], "finished": r[3]} for r in results]

    # API Lấy danh sách lệnh
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
    
    # ... (Các hàm cũ giữ nguyên) ...

    # 8. LẤY DỮ LIỆU ĐỂ IN LỆNH SẢN XUẤT (Full Detail)
    def get_order_print_data(self, order_id: int):
        # A. Header (Thêm shipping_fee, other_fee)
        query_header = text("""
            SELECT po.code, w.name as warehouse_name, w.address as warehouse_address,
                   pv.variant_name as product_name, pv.sku as product_sku,
                   po.quantity_planned, po.start_date, po.due_date,
                   po.product_variant_id,
                   po.shipping_fee, po.other_fee  -- Lấy thêm 2 cột này
            FROM production_orders po
            JOIN warehouses w ON po.warehouse_id = w.id
            JOIN product_variants pv ON po.product_variant_id = pv.id
            WHERE po.id = :oid
        """)
        header = self.db.execute(query_header, {"oid": order_id}).fetchone()
        if not header: raise Exception("Không tìm thấy lệnh")

        # B. Size & Note (GIỮ NGUYÊN)
        query_sizes = text("""
            SELECT size_label, quantity_planned, note 
            FROM production_order_items 
            WHERE production_order_id = :oid
            ORDER BY id ASC
        """)
        sizes = self.db.execute(query_sizes, {"oid": order_id}).fetchall()
        list_sizes = [{"size": s[0], "qty": s[1], "note": s[2]} for s in sizes]

        # C. Materials (Cần lấy thêm giá cost_price để tính tổng tiền trên phiếu in)
        query_materials = text("""
            SELECT m.sku, m.variant_name, bm.quantity_needed, m.cost_price
            FROM bom b
            JOIN bom_materials bm ON b.id = bm.bom_id
            JOIN product_variants m ON bm.material_variant_id = m.id
            WHERE b.product_variant_id = :pid
        """)
        materials = self.db.execute(query_materials, {"pid": header[8]}).fetchall()
        
        list_materials = []
        total_material_cost = 0 # Tổng tiền nguyên liệu

        for m in materials:
            usage = m[2]
            total_needed = usage * header[5]
            unit_cost = m[3] if m[3] else 0
            total_cost_mat = total_needed * unit_cost
            
            total_material_cost += total_cost_mat

            list_materials.append({
                "sku": m[0], "name": m[1], 
                "usage_per_unit": usage, 
                "total_needed": total_needed,
                "unit_cost": unit_cost,
                "total_cost": total_cost_mat
            })

        # D. Ảnh (GIỮ NGUYÊN)
        query_imgs = text("SELECT image_url FROM production_order_images WHERE production_order_id = :oid")
        imgs = self.db.execute(query_imgs, {"oid": order_id}).fetchall()
        list_imgs = [r[0] for r in imgs]

        return {
            "code": header[0],
            "warehouse": header[1],
            "address": header[2],
            "product": header[3],
            "sku": header[4],
            "total_qty": header[5],
            "start_date": header[6],
            "due_date": header[7],
            
            # Thông tin tài chính
            "shipping_fee": header[9],
            "other_fee": header[10],
            "total_material_cost": total_material_cost,
            
            "sizes": list_sizes,
            "materials": list_materials,
            "images": list_imgs
        }