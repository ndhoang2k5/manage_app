from email import header
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from entities.production import BOMCreateRequest, ProductionOrderCreateRequest, QuickProductionRequest, ReceiveGoodsRequest, ProductionUpdateRequest

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
            # A. Tính tổng số lượng sản phẩm
            if hasattr(data, 'size_breakdown') and data.size_breakdown:
                total_planned = sum(item.quantity for item in data.size_breakdown)
            else:
                total_planned = data.quantity_planned
            
            if total_planned <= 0: raise Exception("Tổng số lượng sản phẩm phải lớn hơn 0")

            # B. Tạo Sản phẩm & Variant
            query_prod = text("INSERT INTO products (category_id, name, type, base_unit) VALUES (3, :name, 'finished_good', 'Cái')")
            self.db.execute(query_prod, {"name": data.new_product_name})
            pid = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            query_var = text("""
                INSERT INTO product_variants (product_id, sku, variant_name, cost_price)
                VALUES (:pid, :sku, :name, 0)
            """)
            self.db.execute(query_var, {"pid": pid, "sku": data.new_product_sku, "name": data.new_product_name})
            product_variant_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            # C. Tạo BOM (LƯU Ý: Chuyển đổi từ Tổng lượng -> Định mức/cái để lưu trữ chuẩn)
            query_bom = text("INSERT INTO bom (product_variant_id, name) VALUES (:pid, :name)")
            self.db.execute(query_bom, {"pid": product_variant_id, "name": f"Công thức {data.new_product_name}"})
            bom_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            query_bom_detail = text("INSERT INTO bom_materials (bom_id, material_variant_id, quantity_needed) VALUES (:bid, :mid, :qty)")
            
            total_material_cost = 0

            for item in data.materials:
                # item.quantity_needed lúc này là TỔNG LƯỢNG (User nhập 500m vải)
                # Ta cần chia cho total_planned để ra định mức (500m / 100 áo = 5m/áo)
                # Để lưu vào DB cho đúng chuẩn BOM
                per_unit_usage = item.quantity_needed / total_planned
                
                self.db.execute(query_bom_detail, {
                    "bid": bom_id, 
                    "mid": item.material_variant_id, 
                    "qty": per_unit_usage
                })

                # Tính giá vốn vật tư (để update giá cost_price cho sản phẩm)
                mat_price_row = self.db.execute(text("SELECT cost_price FROM product_variants WHERE id = :id"), {"id": item.material_variant_id}).fetchone()
                
                # --- FIX LỖI Ở ĐÂY: Ép kiểu Decimal sang float ---
                price = float(mat_price_row[0]) if (mat_price_row and mat_price_row[0] is not None) else 0.0
                total_material_cost += (float(item.quantity_needed) * price)


            total_fees = float(data.labor_fee + data.shipping_fee + data.other_fee + data.marketing_fee + data.packaging_fee)
            final_unit_cost = (total_material_cost + total_fees) / float(total_planned)

            self.db.execute(text("UPDATE product_variants SET cost_price = :cost WHERE id = :id"), {
                "cost": final_unit_cost, "id": product_variant_id
            })

            # E. Tạo Lệnh SX
            query_order = text("""
                INSERT INTO production_orders (
                    code, warehouse_id, product_variant_id, quantity_planned, status, start_date, due_date, 
                    shipping_fee, other_fee, labor_fee, marketing_fee, packaging_fee
                )
                VALUES (:code, :wid, :pid, :qty, 'draft', :start, :due, :ship, :other, :labor, :mkt, :pack)
            """)
            self.db.execute(query_order, {
                "code": data.order_code,
                "wid": data.warehouse_id,
                "pid": product_variant_id,
                "qty": total_planned,
                "start": data.start_date,
                "due": data.due_date,
                "ship": data.shipping_fee,
                "other": data.other_fee,
                "labor": data.labor_fee,
                "mkt": data.marketing_fee,
                "pack": data.packaging_fee
            })
            order_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            # F. Lưu Size & Ảnh
            if hasattr(data, 'size_breakdown') and data.size_breakdown:
                query_size = text("INSERT INTO production_order_items (production_order_id, size_label, quantity_planned, quantity_finished, note) VALUES (:oid, :size, :qty, 0, :note)")
                for item in data.size_breakdown:
                    self.db.execute(query_size, {"oid": order_id, "size": item.size, "qty": item.quantity, "note": item.note if item.note else ""})

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
            if "Duplicate entry" in str(e): raise Exception(f"Lỗi: Mã SKU hoặc Mã lệnh đã tồn tại!")
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

            """), {"pid": order[3]}).fetchall()

            if not bom_items: raise Exception("Sản phẩm này chưa có công thức (BOM)!")

            # Duyệt qua từng nguyên liệu để TRỪ KHO
            for item in bom_items:
                mat_id = item[0]
                qty_needed_per_unit = float(item[1])
                order_qty = float(order[4]) 
                total_qty_needed = qty_needed_per_unit * order_qty # Định mức * Tổng SL

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

# 6. Lấy danh sách Lệnh SX (Phân trang + Tìm kiếm + Lọc)
    def get_all_orders(self, page=1, limit=10, search=None, warehouse_name=None):
        offset = (page - 1) * limit
        
        # Xây dựng câu điều kiện WHERE động
        conditions = []
        params = {"limit": limit, "offset": offset}

        # Lưu ý: Alias 'pv' là product_variants
        if search:
            conditions.append("(po.code LIKE :search OR pv.variant_name LIKE :search)")
            params["search"] = f"%{search}%"
        
        if warehouse_name:
            conditions.append("w.name = :wname")
            params["wname"] = warehouse_name

        where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""

        # A. Query Đếm (Sửa JOIN products -> product_variants)
        count_sql = text(f"""
            SELECT COUNT(*)
            FROM production_orders po
            JOIN warehouses w ON po.warehouse_id = w.id
            JOIN product_variants pv ON po.product_variant_id = pv.id 
            {where_clause}
        """)
        total_records = self.db.execute(count_sql, params).scalar()

        # B. Query Lấy dữ liệu (Sửa JOIN products -> product_variants)
        data_sql = text(f"""
            SELECT po.id, po.code, w.name as warehouse_name, pv.variant_name as product_name,
                   po.quantity_planned, po.quantity_finished, po.status, po.start_date, po.due_date
            FROM production_orders po
            JOIN warehouses w ON po.warehouse_id = w.id
            JOIN product_variants pv ON po.product_variant_id = pv.id 
            {where_clause}
            ORDER BY po.id DESC
            LIMIT :limit OFFSET :offset
        """)
        results = self.db.execute(data_sql, params).fetchall()

        return {
            "data": [
                {
                    "id": r[0], "code": r[1], "warehouse_name": r[2], "product_name": r[3],
                    "quantity_planned": r[4], "quantity_finished": r[5], "status": r[6],
                    "start_date": r[7], "due_date": r[8]
                } for r in results
            ],
            "total": total_records,
            "page": page,
            "limit": limit
        }
    
    

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
                   po.shipping_fee, po.other_fee,
                   po.labor_fee, po.marketing_fee, po.packaging_fee
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

            "labor_fee": header[11],
            "marketing_fee": header[12],
            "packaging_fee": header[13],
            
            "sizes": list_sizes,
            "materials": list_materials,
            "images": list_imgs
        }
    

    # 7. CẬP NHẬT THÔNG TIN LỆNH SẢN XUẤT (Chi phí và ngày tháng) - YÊU CẦU MỚI
    def update_production_order(self, order_id: int, data: ProductionUpdateRequest):
        try:
            # 1. Cập nhật thông tin trong bảng Orders
            query = text("""
                UPDATE production_orders
                SET shipping_fee = :ship, other_fee = :other, labor_fee = :labor,
                    marketing_fee = :mkt, packaging_fee = :pack,
                    start_date = :start, due_date = :due
                WHERE id = :id
            """)
            self.db.execute(query, {
                "ship": data.shipping_fee, "other": data.other_fee, "labor": data.labor_fee,
                "mkt": data.marketing_fee, "pack": data.packaging_fee,
                "start": data.start_date, "due": data.due_date, "id": order_id
            })

            # 2. Cập nhật SKU (Nếu có yêu cầu sửa SKU) - YÊU CẦU MỚI
            # Lấy product_variant_id của lệnh này
            order = self.db.execute(text("SELECT product_variant_id FROM production_orders WHERE id = :id"), {"id": order_id}).fetchone()
            if order and hasattr(data, 'new_sku') and data.new_sku:
                # Update SKU trong bảng product_variants
                self.db.execute(text("UPDATE product_variants SET sku = :sku WHERE id = :pid"), {
                    "sku": data.new_sku, "pid": order[0]
                })

            self.db.commit()
            return {"status": "success", "message": "Cập nhật đơn hàng thành công!"}
        except IntegrityError as e:
            self.db.rollback()
            raise Exception("Mã SKU mới bị trùng!")
        except Exception as e:
            self.db.rollback()
            raise e
        

    # 8. XÓA ĐƠN HÀNG & HOÀN KHO (DELETE / CANCEL) - YÊU CẦU MỚI
    def delete_production_order(self, order_id: int):
        try:
            # A. Lấy thông tin lệnh
            order = self.db.execute(text("SELECT * FROM production_orders WHERE id = :id"), {"id": order_id}).fetchone()
            if not order: raise Exception("Đơn hàng không tồn tại")
            
            status = order[6] # status column
            warehouse_id = order[2]
            
            # B. Nếu đơn hàng đã chạy (in_progress) hoặc xong -> Phải hoàn trả NVL vào kho
            if status in ['in_progress', 'completed']:
                # Lấy danh sách NVL đã trừ (dựa vào bảng reservation hoặc BOM)
                # Cách chính xác nhất: Lấy từ bảng production_material_reservations (nơi lưu số lượng đã trừ)
                reservations = self.db.execute(text("""
                    SELECT material_variant_id, quantity_reserved 
                    FROM production_material_reservations 
                    WHERE production_order_id = :oid
                """), {"oid": order_id}).fetchall()

                for res in reservations:
                    mat_id = res[0]
                    qty_return = res[1]
                    
                    # Cộng lại vào kho
                    self.db.execute(text("""
                        UPDATE inventory_stocks 
                        SET quantity_on_hand = quantity_on_hand + :qty
                        WHERE warehouse_id = :wid AND product_variant_id = :mid
                    """), {"qty": qty_return, "wid": warehouse_id, "mid": mat_id})

                    # Ghi log hoàn trả
                    self.db.execute(text("""
                        INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id, note)
                        VALUES (:wid, :mid, 'production_in', :qty, :ref, 'Hoàn trả do xóa lệnh')
                    """), {"wid": warehouse_id, "mid": mat_id, "qty": qty_return, "ref": order_id})

                # Nếu đơn đã Completed -> Phải trừ Thành phẩm đã nhập (nếu muốn xóa sạch)
                # Nhưng thường xóa lệnh là do làm sai, nên ta cứ xóa. Cẩn thận hơn thì check quantity_finished.
                if order[5] > 0: # quantity_finished
                     # Trừ kho thành phẩm (Revert nhập kho)
                     pid = order[3]
                     qty_finished = order[5]
                     self.db.execute(text("""
                        UPDATE inventory_stocks SET quantity_on_hand = quantity_on_hand - :qty
                        WHERE warehouse_id = :wid AND product_variant_id = :pid
                     """), {"qty": qty_finished, "wid": warehouse_id, "pid": pid})
                     
                     self.db.execute(text("""
                        INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id, note)
                        VALUES (:wid, :pid, 'production_out', :qty, :ref, 'Hủy nhập TP do xóa lệnh')
                    """), {"wid": warehouse_id, "pid": pid, "qty": -qty_finished, "ref": order_id})

            # C. Xóa dữ liệu trong các bảng liên quan (Do có khóa ngoại nên phải xóa con trước)
            self.db.execute(text("DELETE FROM production_receive_logs WHERE production_order_id = :id"), {"id": order_id})
            self.db.execute(text("DELETE FROM production_order_images WHERE production_order_id = :id"), {"id": order_id})
            self.db.execute(text("DELETE FROM production_material_reservations WHERE production_order_id = :id"), {"id": order_id})
            self.db.execute(text("DELETE FROM production_order_items WHERE production_order_id = :id"), {"id": order_id})
            
            # D. Xóa Lệnh chính
            self.db.execute(text("DELETE FROM production_orders WHERE id = :id"), {"id": order_id})

            self.db.commit()
            return {"status": "success", "message": "Đã xóa đơn hàng và hoàn trả kho (nếu có)."}

        except Exception as e:
            self.db.rollback()
            raise e
