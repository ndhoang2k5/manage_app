from email import header
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
import json
from entities.production import BOMCreateRequest, ProductionOrderCreateRequest, QuickProductionRequest, ReceiveGoodsRequest, ProductionUpdateRequest, UpdateProgressRequest, ProgressItem, ProductionMaterialUpdateItem, ProductionSizeUpdateItem
from typing import List, Optional, Dict

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

    def create_quick_order(self, data: QuickProductionRequest, user_id: int = None):
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

            # C. Tạo BOM (Lưu định mức/cái)
            query_bom = text("INSERT INTO bom (product_variant_id, name) VALUES (:pid, :name)")
            self.db.execute(query_bom, {"pid": product_variant_id, "name": f"Công thức {data.new_product_name}"})
            bom_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            query_bom_detail = text("INSERT INTO bom_materials (bom_id, material_variant_id, quantity_needed, note) VALUES (:bid, :mid, :qty, :note)")
            
            total_material_cost = 0.0

            for item in data.materials:
                # Tính định mức cho 1 sản phẩm = Tổng lượng / Tổng sản phẩm
                # Ví dụ: Cần 1000m vải cho 500 áo -> Định mức = 2m/áo
                per_unit_usage = float(item.quantity_needed) / float(total_planned)

                self.db.execute(query_bom_detail, {
                    "bid": bom_id, 
                    "mid": item.material_variant_id, 
                    "qty": per_unit_usage, # Lưu định mức
                    "note": item.note if item.note else ""
                })

                # Tính giá vốn (Lấy giá * Tổng lượng)
                mat_price_row = self.db.execute(text("SELECT cost_price FROM product_variants WHERE id = :id"), {"id": item.material_variant_id}).fetchone()
                price = float(mat_price_row[0]) if (mat_price_row and mat_price_row[0] is not None) else 0.0
                total_material_cost += (float(item.quantity_needed) * price)

            # D. Tính giá vốn đơn vị
            total_fees = float(data.labor_fee + data.shipping_fee + data.other_fee + data.marketing_fee + data.packaging_fee + data.print_fee)
            final_unit_cost = (total_material_cost + total_fees) / float(total_planned)

            self.db.execute(text("UPDATE product_variants SET cost_price = :cost WHERE id = :id"), {
                "cost": final_unit_cost, "id": product_variant_id
            })


            default_steps = [
                {"name": "Bước 1: Chuẩn bị NVL & Rập", "done": False, "deadline": str(data.start_date)},
                {"name": "Bước 2: Cắt bán thành phẩm", "done": False, "deadline": str(data.start_date)}, # +3 ngày tùy logic
                {"name": "Bước 3: May gia công", "done": False, "deadline": str(data.due_date)},
                {"name": "Bước 4: KCS & Đóng gói", "done": False, "deadline": str(data.due_date)},
            ]
            progress_json = json.dumps(default_steps)


            # E. Tạo Lệnh SX
            query_order = text("""
                INSERT INTO production_orders (
                    code, warehouse_id, product_variant_id, quantity_planned, status, start_date, due_date, 
                    shipping_fee, other_fee, labor_fee, marketing_fee, packaging_fee, print_fee, created_by, progress_data
                )
                VALUES (:code, :wid, :pid, :qty, 'draft', :start, :due, :ship, :other, :labor, :mkt, :pack, :print, :uid, :progress)
            """)
            self.db.execute(query_order, {
                "code": data.order_code, "wid": data.warehouse_id, "pid": product_variant_id,
                "qty": total_planned, "start": data.start_date, "due": data.due_date,
                "ship": data.shipping_fee, "other": data.other_fee, "labor": data.labor_fee,
                "mkt": data.marketing_fee, "pack": data.packaging_fee, "print": data.print_fee,
                "uid": user_id if user_id else None,
                "progress": progress_json
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

            if data.auto_start:
                self.start_production(order_id, commit=False) 
            self.db.commit()

            return {"status": "success", "message": "Đã tạo Mẫu & Lệnh SX thành công!"}

        except IntegrityError as e:
            self.db.rollback()
            if "Duplicate entry" in str(e): raise Exception(f"Lỗi: Mã SKU hoặc Mã lệnh đã tồn tại!")
            raise Exception(str(e))
        except Exception as e:
            self.db.rollback()
            raise e

    # 3. CẬP NHẬT TIẾN ĐỘ (PROGRESS) - YÊU CẦU MỚI
    def update_progress(self, order_id: int, data: UpdateProgressRequest):
        # Chuyển object thành string JSON để lưu
        json_str = json.dumps([item.dict() for item in data.steps])
        self.db.execute(text("UPDATE production_orders SET progress_data = :p WHERE id = :id"), {"p": json_str, "id": order_id})
        self.db.commit()
        return {"status": "success", "message": "Đã cập nhật tiến độ!"}


    # 4. Bắt đầu SX (Có tham số commit để hỗ trợ transaction lồng)
    def start_production(self, order_id: int, commit: bool = True):
        try:
            # Lấy thông tin lệnh
            order = self.db.execute(text("SELECT * FROM production_orders WHERE id = :id"), {"id": order_id}).fetchone()
            if not order: raise Exception("Không tìm thấy lệnh SX")
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
                raw_total = qty_needed_per_unit * order_qty
               
                total_qty_needed = round(raw_total, 4) 

                stock = self.db.execute(text("""
                    SELECT quantity_on_hand
                    FROM inventory_stocks 
                    WHERE warehouse_id = :wid AND product_variant_id = :mid
                """), {"wid": order[2], "mid": mat_id}).fetchone()

                current_stock = float(stock[0]) if stock else 0.0

                if current_stock < total_qty_needed:
                    raise Exception(f"Kho thiếu nguyên liệu ID {mat_id}. Cần {total_qty_needed}, chỉ còn {current_stock}")

                # --- TRỪ TRỰC TIẾP ---
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

                # Lưu reservation
                self.db.execute(text("""
                    INSERT INTO production_material_reservations (production_order_id, material_variant_id, quantity_reserved)
                    VALUES (:oid, :mid, :qty)
                """), {"oid": order_id, "mid": mat_id, "qty": total_qty_needed})

            # Cập nhật trạng thái lệnh
            self.db.execute(text("UPDATE production_orders SET status = 'in_progress' WHERE id = :id"), {"id": order_id})
            
            if commit:
                self.db.commit()
                
            return {"status": "success", "message": "Đã xuất kho nguyên liệu & Bắt đầu sản xuất!"}

        except Exception as e:
            if commit: self.db.rollback()
            # Nếu gọi lồng, để hàm cha rollback
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

                self.db.execute(text("""
                    INSERT INTO inventory_stocks (warehouse_id, product_variant_id, quantity_on_hand)
                    VALUES (:wid, :pid, :qty)
                    ON DUPLICATE KEY UPDATE quantity_on_hand = quantity_on_hand + :qty
                """), {"wid": wid, "pid": pid, "qty": item.quantity})

                total_received_now += item.quantity

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

    def get_receive_history(self, order_id: int):
        query = text("""
            SELECT 
                l.id,
                l.received_at,
                i.size_label,
                i.note as size_note,
                l.quantity,
                i.quantity_planned, 
                i.quantity_finished 
            FROM production_receive_logs l
            JOIN production_order_items i ON l.production_order_item_id = i.id
            WHERE l.production_order_id = :oid
            ORDER BY l.received_at DESC
        """)
        results = self.db.execute(query, {"oid": order_id}).fetchall()
        
        return [
            {
                "id": r[0],
                "date": r[1].strftime("%Y-%m-%d %H:%M"),
                "size": r[2],
                "note": r[3],
                "quantity": r[4],
                "remaining": r[5] - r[6]
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

# 6. Lấy danh sách Lệnh SX (CHUẨN PHÂN TRANG)
    def get_all_orders(self, page=1, limit=10, search=None, warehouse_name=None, allowed_warehouse_ids: Optional[List[int]] = None):
        offset = (page - 1) * limit
        
        conditions = []
        params = {"limit": limit, "offset": offset}

        if allowed_warehouse_ids is not None:
            if len(allowed_warehouse_ids) == 0:
                return {"data": [], "total": 0, "page": page, "limit": limit}

            ids_str = ",".join(map(str, allowed_warehouse_ids))
            conditions.append(f"po.warehouse_id IN ({ids_str})")

        if search:
            conditions.append("(po.code LIKE :search OR pv.variant_name LIKE :search)")
            params["search"] = f"%{search}%"
        
        if warehouse_name:
            conditions.append("w.name = :wname")
            params["wname"] = warehouse_name

        where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""

        # Đếm tổng
        count_sql = text(f"""
            SELECT COUNT(*)
            FROM production_orders po
            JOIN warehouses w ON po.warehouse_id = w.id
            JOIN product_variants pv ON po.product_variant_id = pv.id
            {where_clause}
        """)
        total_records = self.db.execute(count_sql, params).scalar()

        # Lấy dữ liệu
        data_sql = text(f"""
            SELECT po.id, po.code, w.name as warehouse_name, pv.variant_name as product_name,
                   po.quantity_planned, po.quantity_finished, po.status, po.start_date, po.due_date, po.progress_data, po.warehouse_id
            FROM production_orders po
            JOIN warehouses w ON po.warehouse_id = w.id
            JOIN product_variants pv ON po.product_variant_id = pv.id 
            {where_clause}
            ORDER BY po.id DESC
            LIMIT :limit OFFSET :offset
        """)
        results = self.db.execute(data_sql, params).fetchall()

        result_list = []
        for r in results:
            # Xử lý Progress: Chuyển từ JSON String -> Python List/Dict
            progress_raw = r[9]
            progress_parsed = []
            if progress_raw:
                try:
                    if isinstance(progress_raw, str):
                        progress_parsed = json.loads(progress_raw)
                    else:
                        progress_parsed = progress_raw # Trường hợp DB driver tự parse
                except:
                    progress_parsed = [] # Nếu lỗi JSON thì trả về rỗng

            result_list.append({
                "id": r[0], 
                "code": r[1], 
                "warehouse_name": r[2], 
                "product_name": r[3],
                "quantity_planned": r[4], 
                "quantity_finished": r[5], 
                "status": r[6],
                "start_date": r[7], 
                "due_date": r[8], 
                "warehouse_id": r[10],
                "progress": progress_parsed 
            })

        return {
            "data": result_list,
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

    # 8. LẤY DỮ LIỆU ĐỂ IN (ĐÃ CẬP NHẬT LOGIC LẤY NVL THỰC TẾ)
    def get_order_print_data(self, order_id: int):
        # A. Header (Giữ nguyên)
        query_header = text("""
            SELECT po.code, w.name as warehouse_name, w.address as warehouse_address,
                   pv.variant_name as product_name, pv.sku as product_sku,
                   po.quantity_planned, po.start_date, po.due_date,
                   po.product_variant_id,
                   po.shipping_fee, po.other_fee,
                   po.labor_fee, po.marketing_fee, po.packaging_fee, po.print_fee,
                   po.status
            FROM production_orders po
            JOIN warehouses w ON po.warehouse_id = w.id
            JOIN product_variants pv ON po.product_variant_id = pv.id
            WHERE po.id = :oid
        """)
        header = self.db.execute(query_header, {"oid": order_id}).fetchone()
        if not header: raise Exception("Không tìm thấy lệnh")
        
        status = header[15]
        total_qty = header[5]

        # B. Size (Giữ nguyên)
        query_sizes = text("SELECT size_label, quantity_planned, note FROM production_order_items WHERE production_order_id = :oid ORDER BY id ASC")
        sizes = self.db.execute(query_sizes, {"oid": order_id}).fetchall()
        list_sizes = [{"size": s[0], "qty": s[1], "note": s[2]} for s in sizes]

        # C. Materials (LOGIC MỚI: Ưu tiên lấy từ Reservation nếu có)
        list_materials = []
        total_material_cost = 0

        # Nếu đơn đã Start hoặc có Reservation -> Lấy từ bảng Reservation (Chính xác nhất sau khi sửa)
        if status in ['in_progress', 'completed']:
            query_res = text("""
                SELECT m.sku, m.variant_name, pmr.quantity_reserved, m.cost_price, pmr.note
                FROM production_material_reservations pmr
                JOIN product_variants m ON pmr.material_variant_id = m.id
                WHERE pmr.production_order_id = :oid
            """)
            materials = self.db.execute(query_res, {"oid": order_id}).fetchall()
            
            for m in materials:
                # Sửa dòng này: Thêm round(..., 4)
                total_needed = round(float(m[2]), 4)
                
                unit_cost = float(m[3] or 0)
                total_cost_mat = total_needed * unit_cost
                total_material_cost += total_cost_mat

                list_materials.append({
                    "sku": m[0], "name": m[1], 
                    "total_needed": total_needed, # Giá trị này giờ đã tròn đẹp (ví dụ 26.2)
                    "unit_cost": unit_cost,
                    "total_cost": total_cost_mat,
                    "note": m[4]
                })
        
        # Nếu chưa Start -> Lấy từ BOM (Dự kiến)
        else:
            query_bom = text("""
                SELECT m.sku, m.variant_name, bm.quantity_needed, m.cost_price, bm.note
                FROM bom b
                JOIN bom_materials bm ON b.id = bm.bom_id
                JOIN product_variants m ON bm.material_variant_id = m.id
                WHERE b.product_variant_id = :pid
            """)
            materials = self.db.execute(query_bom, {"pid": header[8]}).fetchall()
            
            for m in materials:
                usage = float(m[2])
                total_needed = usage * total_qty # Nhân định mức với số lượng
                unit_cost = float(m[3] or 0)
                total_cost_mat = total_needed * unit_cost
                total_material_cost += total_cost_mat

                list_materials.append({
                    "sku": m[0], "name": m[1], 
                    "total_needed": total_needed,
                    "unit_cost": unit_cost,
                    "total_cost": total_cost_mat,
                    "note": m[4]
                })

        # D. Ảnh (Giữ nguyên)
        query_imgs = text("SELECT image_url FROM production_order_images WHERE production_order_id = :oid")
        list_imgs = [r[0] for r in self.db.execute(query_imgs, {"oid": order_id}).fetchall()]

        return {
            "code": header[0],
            "warehouse": header[1],
            "address": header[2],
            "product": header[3],
            "sku": header[4],
            "total_qty": total_qty,
            "start_date": header[6],
            "due_date": header[7],
            
            "shipping_fee": header[9],
            "other_fee": header[10],
            "total_material_cost": total_material_cost, # Tổng tiền mới
            "labor_fee": header[11],
            "marketing_fee": header[12],
            "packaging_fee": header[13],
            "print_fee": header[14],
            
            "sizes": list_sizes,
            "materials": list_materials, # Danh sách mới
            "images": list_imgs
        }
    
    def update_production_order(self, order_id: int, data: ProductionUpdateRequest):
        try:
            print(f"--- DEBUG UPDATE ORDER {order_id} ---")
            # 1. Lấy thông tin cơ bản
            order = self.db.execute(text("SELECT warehouse_id, status, product_variant_id, quantity_planned FROM production_orders WHERE id = :id"), {"id": order_id}).fetchone()
            if not order: raise Exception("Không tìm thấy đơn hàng")
            
            wid = order[0]
            status = order[1]
            pid = order[2]
            qty_planned = order[3]
            print(f"Status: {status}")

            # 2. Cập nhật Header
            query_header = text("""
                UPDATE production_orders
                SET shipping_fee = :ship, other_fee = :other, labor_fee = :labor, print_fee = :print,
                    marketing_fee = :mkt, packaging_fee = :pack,
                    start_date = :start, due_date = :due
                WHERE id = :id
            """)
            self.db.execute(query_header, {
                "ship": data.shipping_fee, "other": data.other_fee, "labor": data.labor_fee, "print": data.print_fee,
                "mkt": data.marketing_fee, "pack": data.packaging_fee,
                "start": data.start_date, "due": data.due_date, "id": order_id
            })

            if data.sizes is not None:
                total_qty_planned = 0
                for s in data.sizes:
                    total_qty_planned += s.quantity
                    
                    if s.id:
                        # Cập nhật dòng cũ
                        self.db.execute(text("UPDATE production_order_items SET size_label=:size, quantity_planned=:qty, note=:note WHERE id=:id"),
                                        {"size": s.size, "qty": s.quantity, "note": s.note, "id": s.id})
                    else:
                        # Thêm size mới (nếu có logic thêm size)
                        self.db.execute(text("INSERT INTO production_order_items (production_order_id, size_label, quantity_planned, quantity_finished, note) VALUES (:oid, :size, :qty, 0, :note)"),
                                        {"oid": order_id, "size": s.size, "qty": s.quantity, "note": s.note})
                
                # Cập nhật tổng số lượng dự kiến vào bảng cha
                self.db.execute(text("UPDATE production_orders SET quantity_planned = :q WHERE id = :id"), {"q": total_qty_planned, "id": order_id})

            # 3. XỬ LÝ NGUYÊN VẬT LIỆU
            if data.materials is not None: # Chỉ chạy nếu có gửi materials
                print(f"Materials count: {len(data.materials)}") # <--- Log 3
                for item in data.materials:
                    
                    # === TRƯỜNG HỢP A: ĐƠN ĐANG CHẠY (IN PROGRESS) -> Sửa bảng Reservation & Trừ kho ===
                    if status in ['in_progress', 'completed']:
                        print("-> Branch: IN_PROGRESS") # <--- Log 5
                        if item.id: 
                            # Sửa dòng cũ
                            old_res = self.db.execute(text("SELECT quantity_reserved, material_variant_id FROM production_material_reservations WHERE id=:id"), {"id": item.id}).fetchone()
                            if old_res:
                                old_qty = float(old_res[0])
                                mat_id = old_res[1]
                                new_qty_rounded = round(item.quantity, 4)
                                old_qty_rounded = round(old_qty, 4)
                                diff = round(new_qty_rounded - old_qty_rounded, 4)

                                # Cập nhật kho nếu có chênh lệch
                                if diff > 0: # Cần thêm -> Trừ kho
                                    stock = self.db.execute(text("SELECT quantity_on_hand FROM inventory_stocks WHERE warehouse_id=:w AND product_variant_id=:m"), {"w": wid, "m": mat_id}).scalar() or 0
                                    if stock < diff: raise Exception(f"Kho không đủ hàng! Cần thêm {diff}, còn {stock}")
                                    self.db.execute(text("UPDATE inventory_stocks SET quantity_on_hand = quantity_on_hand - :q WHERE warehouse_id=:w AND product_variant_id=:m"), {"q": diff, "w": wid, "m": mat_id})
                                    self.db.execute(text("INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id, note) VALUES (:w, :m, 'production_out', :q, :ref, 'Sửa lệnh: Cấp thêm')"), {"w": wid, "m": mat_id, "q": -diff, "ref": order_id})
                                elif diff < 0: # Giảm -> Trả kho
                                    self.db.execute(text("UPDATE inventory_stocks SET quantity_on_hand = quantity_on_hand + :q WHERE warehouse_id=:w AND product_variant_id=:m"), {"q": abs(diff), "w": wid, "m": mat_id})
                                    self.db.execute(text("INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id, note) VALUES (:w, :m, 'production_in', :q, :ref, 'Sửa lệnh: Hoàn trả')"), {"w": wid, "m": mat_id, "q": abs(diff), "ref": order_id})
                                
                                # Lưu vào reservation
                                self.db.execute(text("UPDATE production_material_reservations SET quantity_reserved = :q, note = :n WHERE id = :id"), {"q": item.quantity, "n": item.note, "id": item.id})
                        else: 
                            # Thêm mới (khi đang chạy)
                            if not item.material_variant_id: continue
                            mat_id = item.material_variant_id
                            # Trừ kho ngay
                            stock = self.db.execute(text("SELECT quantity_on_hand FROM inventory_stocks WHERE warehouse_id=:w AND product_variant_id=:m"), {"w": wid, "m": mat_id}).scalar() or 0
                            if stock < item.quantity: raise Exception(f"Kho không đủ hàng mới! Cần {item.quantity}, còn {stock}")
                            
                            self.db.execute(text("UPDATE inventory_stocks SET quantity_on_hand = quantity_on_hand - :q WHERE warehouse_id=:w AND product_variant_id=:m"), {"q": item.quantity, "w": wid, "m": mat_id})
                            self.db.execute(text("INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id, note) VALUES (:w, :m, 'production_out', :q, :ref, 'Thêm NVL mới')"), {"w": wid, "m": mat_id, "q": -item.quantity, "ref": order_id})
                            
                            # Insert vào reservation
                            self.db.execute(text("INSERT INTO production_material_reservations (production_order_id, material_variant_id, quantity_reserved, note) VALUES (:oid, :mid, :qty, :note)"), 
                                            {"oid": order_id, "mid": mat_id, "qty": item.quantity, "note": item.note})

                    # === TRƯỜNG HỢP B: ĐƠN NHÁP (DRAFT) -> Sửa bảng BOM ===
                    else:
                        print("-> Branch: DRAFT (BOM)") # <--- Log 6
                        # Lấy BOM ID từ Product ID
                        bom_id = self.db.execute(text("SELECT id FROM bom WHERE product_variant_id=:pid"), {"pid": pid}).scalar()
                        
                        if bom_id:
                            # Tính lại định mức đơn vị (Backend lưu định mức/1 cái, nhưng Frontend gửi Tổng số lượng)
                            # Định mức = Tổng cần / Số lượng đơn hàng
                            print(f"   Calculating: RequestQty={item.quantity} / PlannedQty={qty_planned}")
                            per_unit_qty = item.quantity / qty_planned if qty_planned > 0 else 0

                            if item.id:
                                print(f"   Updating BOM Material ID={item.id}")
                                # Update dòng BOM cũ
                                # Lưu ý: item.id ở đây là ID của bom_materials (do hàm get_reservations trả về)
                                self.db.execute(text("UPDATE bom_materials SET quantity_needed = :q, note = :n WHERE id = :id"), 
                                                {"q": per_unit_qty, "n": item.note, "id": item.id})
                            else:
                                # Thêm dòng BOM mới
                                if item.material_variant_id:
                                    self.db.execute(text("INSERT INTO bom_materials (bom_id, material_variant_id, quantity_needed, note) VALUES (:bid, :mid, :q, :n)"),
                                                    {"bid": bom_id, "mid": item.material_variant_id, "q": per_unit_qty, "n": item.note})

            # 4. Cập nhật SKU (Giữ nguyên)
            if hasattr(data, 'new_sku') and data.new_sku:
                self.db.execute(text("UPDATE product_variants SET sku = :sku WHERE id = :pid"), {"sku": data.new_sku, "pid": pid})
            
            # 5. Cập nhật Ảnh (Logic mới)
            if data.image_urls is not None:
                # Xóa ảnh cũ
                self.db.execute(text("DELETE FROM production_order_images WHERE production_order_id = :oid"), {"oid": order_id})
                
                # Thêm ảnh mới
                if len(data.image_urls) > 0:
                    query_img = text("INSERT INTO production_order_images (production_order_id, image_url) VALUES (:oid, :url)")
                    for url in data.image_urls:
                        self.db.execute(query_img, {"oid": order_id, "url": url})

            self.db.commit()
            return {"status": "success", "message": "Cập nhật thành công!"}
        except Exception as e:
            self.db.rollback()
            raise e
        


    # 8. XÓA ĐƠN HÀNG & HOÀN KHO & XÓA SKU TẠO NHANH
    def delete_production_order(self, order_id: int):
        try:
            # A. Lấy thông tin lệnh
            order = self.db.execute(text("SELECT * FROM production_orders WHERE id = :id"), {"id": order_id}).fetchone()
            if not order: raise Exception("Đơn hàng không tồn tại")
            
            status = order[6] 
            warehouse_id = order[2]
            product_variant_id = order[3] # Lấy ID sản phẩm để xóa sau này
            
            # B. Hoàn trả NVL (Logic giữ nguyên)
            if status in ['in_progress', 'completed']:
                reservations = self.db.execute(text("""
                    SELECT material_variant_id, quantity_reserved 
                    FROM production_material_reservations 
                    WHERE production_order_id = :oid
                """), {"oid": order_id}).fetchall()

                for res in reservations:
                    mat_id = res[0]
                    qty_return = res[1]
                    
                    self.db.execute(text("""
                        UPDATE inventory_stocks 
                        SET quantity_on_hand = quantity_on_hand + :qty
                        WHERE warehouse_id = :wid AND product_variant_id = :mid
                    """), {"qty": qty_return, "wid": warehouse_id, "mid": mat_id})

                    self.db.execute(text("""
                        INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id, note)
                        VALUES (:wid, :mid, 'production_in', :qty, :ref, 'Hoàn trả do xóa lệnh')
                    """), {"wid": warehouse_id, "mid": mat_id, "qty": qty_return, "ref": order_id})

                if order[5] > 0: # quantity_finished
                     qty_finished = order[5]
                     self.db.execute(text("""
                        UPDATE inventory_stocks SET quantity_on_hand = quantity_on_hand - :qty
                        WHERE warehouse_id = :wid AND product_variant_id = :pid
                     """), {"qty": qty_finished, "wid": warehouse_id, "pid": product_variant_id})
                     
                     self.db.execute(text("""
                        INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id, note)
                        VALUES (:wid, :pid, 'production_out', :qty, :ref, 'Hủy nhập TP do xóa lệnh')
                    """), {"wid": warehouse_id, "pid": product_variant_id, "qty": -qty_finished, "ref": order_id})

            # C. Xóa dữ liệu bảng con của Lệnh SX
            self.db.execute(text("DELETE FROM production_receive_logs WHERE production_order_id = :id"), {"id": order_id})
            self.db.execute(text("DELETE FROM production_order_images WHERE production_order_id = :id"), {"id": order_id})
            self.db.execute(text("DELETE FROM production_material_reservations WHERE production_order_id = :id"), {"id": order_id})
            self.db.execute(text("DELETE FROM production_order_items WHERE production_order_id = :id"), {"id": order_id})
            
            # D. Xóa Lệnh chính
            self.db.execute(text("DELETE FROM production_orders WHERE id = :id"), {"id": order_id})

            # --- E. (MỚI) XÓA SẢN PHẨM & SKU NẾU ĐƯỢC TẠO TỪ QUICK ORDER ---
            # Để tránh lỗi trùng SKU khi tạo lại, ta thử xóa sản phẩm đó đi.
            # Dùng try/catch để nếu sản phẩm này đang dùng ở đơn khác thì bỏ qua không xóa.
            try:
                # 1. Xóa BOM (Công thức) trước
                self.db.execute(text("""
                    DELETE FROM bom_materials 
                    WHERE bom_id IN (SELECT id FROM bom WHERE product_variant_id = :pid)
                """), {"pid": product_variant_id})
                
                self.db.execute(text("DELETE FROM bom WHERE product_variant_id = :pid"), {"pid": product_variant_id})

                # 2. Xóa Variant (SKU)
                self.db.execute(text("DELETE FROM product_variants WHERE id = :pid"), {"pid": product_variant_id})
            except Exception as e:
                # Nếu không xóa được (do dính ràng buộc khác) thì thôi, in ra log để biết
                print(f"Warning: Không thể xóa SKU sau khi xóa đơn (có thể đang được dùng nơi khác): {str(e)}")

            self.db.commit()
            return {"status": "success", "message": "Đã xóa đơn hàng, hoàn kho và dọn dẹp SKU."}

        except Exception as e:
            self.db.rollback()
            raise e

    def revert_receive_log(self, log_id: int):
        try:
            # 1. Lấy thông tin log nhập hàng cũ
            log = self.db.execute(text("""
                SELECT l.production_order_id, l.production_order_item_id, l.quantity, 
                       po.warehouse_id, po.product_variant_id
                FROM production_receive_logs l
                JOIN production_orders po ON l.production_order_id = po.id
                WHERE l.id = :lid
            """), {"lid": log_id}).fetchone()

            if not log:
                raise Exception("Không tìm thấy lịch sử nhập này")

            order_id, item_id, qty, wid, pid = log

            # 2. Trừ kho thành phẩm (Revert Stock)
            current_stock = self.db.execute(text("SELECT quantity_on_hand FROM inventory_stocks WHERE warehouse_id=:w AND product_variant_id=:p"), {"w": wid, "p": pid}).scalar() or 0
            if current_stock < qty:
                raise Exception(f"Không thể hoàn tác! Kho chỉ còn {current_stock} sản phẩm (Cần trừ {qty}).")

            self.db.execute(text("""
                UPDATE inventory_stocks 
                SET quantity_on_hand = quantity_on_hand - :qty
                WHERE warehouse_id = :wid AND product_variant_id = :pid
            """), {"qty": qty, "wid": wid, "pid": pid})

            # 3. Trừ số lượng đã hoàn thành trong Order Header & Item
            self.db.execute(text("UPDATE production_orders SET quantity_finished = quantity_finished - :qty WHERE id = :id"), {"qty": qty, "id": order_id})
            self.db.execute(text("UPDATE production_order_items SET quantity_finished = quantity_finished - :qty WHERE id = :id"), {"qty": qty, "id": item_id})

            # 4. Ghi log kho (Transaction Out để cân bằng)
            self.db.execute(text("""
                INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id, note)
                VALUES (:wid, :pid, 'production_out', :qty, :ref, :note)
            """), {"wid": wid, "pid": pid, "qty": -qty, "ref": order_id, "note": f"Hoàn tác nhập kho #{log_id}"})

            # 5. Xóa dòng log
            self.db.execute(text("DELETE FROM production_receive_logs WHERE id = :id"), {"id": log_id})

            self.db.commit()
            return {"status": "success", "message": "Đã hoàn tác nhập kho thành công."}
        except Exception as e:
            self.db.rollback()
            raise e

            
    # CẬP NHẬT THÊM ID VÀO HÀM LẤY LỊCH SỬ ĐỂ FRONTEND GỌI XÓA ĐƯỢC
    def get_receive_history(self, order_id: int):
        query = text("""
            SELECT 
                l.id,  -- Thêm lấy ID log
                l.received_at,
                i.size_label,
                i.note as size_note,
                l.quantity,
                i.quantity_planned, 
                i.quantity_finished
            FROM production_receive_logs l
            JOIN production_order_items i ON l.production_order_item_id = i.id
            WHERE l.production_order_id = :oid
            ORDER BY l.received_at DESC
        """)
        results = self.db.execute(query, {"oid": order_id}).fetchall()
        
        return [
            {
                "id": r[0], # Trả về ID
                "date": r[1].strftime("%Y-%m-%d %H:%M"),
                "size": r[2],
                "note": r[3],
                "quantity": r[4],
                "remaining": r[5] - r[6]
            } for r in results
        ]

    def get_order_reservations(self, order_id: int):
        # 1. Lấy trạng thái đơn hàng
        order = self.db.execute(text("SELECT status, product_variant_id, quantity_planned FROM production_orders WHERE id=:id"), {"id": order_id}).fetchone()
        if not order: return []
        
        status = order[0]
        pid = order[1]
        qty_planned = order[2]

        # TRƯỜNG HỢP 1: ĐÃ START (Lấy từ bảng Reservation - Dữ liệu thực tế đã trừ kho)
        if status in ['in_progress', 'completed']:
            query = text("""
                SELECT pmr.id, pmr.material_variant_id, pv.sku, pv.variant_name, pmr.quantity_reserved, pmr.note, pv.cost_price
                FROM production_material_reservations pmr
                JOIN product_variants pv ON pmr.material_variant_id = pv.id
                WHERE pmr.production_order_id = :oid
            """)
            results = self.db.execute(query, {"oid": order_id}).fetchall()
            return [
                {
                    "id": r[0], 
                    "material_variant_id": r[1], 
                    "sku": r[2], 
                    "name": r[3], 
                    "quantity": round(float(r[4]), 4) if r[4] is not None else 0,
                    "note": r[5], 
                    "unit_price": r[6] or 0
                } for r in results
            ]

        # TRƯỜNG HỢP 2: CHƯA START (Lấy từ BOM - Dữ liệu lý thuyết)
        else:
            query = text("""
                SELECT bm.id, bm.material_variant_id, pv.sku, pv.variant_name, bm.quantity_needed, bm.note, pv.cost_price
                FROM bom_materials bm
                JOIN bom b ON bm.bom_id = b.id
                JOIN product_variants pv ON bm.material_variant_id = pv.id
                WHERE b.product_variant_id = :pid
            """)
            results = self.db.execute(query, {"pid": pid}).fetchall()
            
            return [
                {
                    "id": r[0], # Đây là ID của dòng BOM (để biết đường update lại BOM)
                    "material_variant_id": r[1],
                    "sku": r[2], 
                    "name": r[3],
                    "quantity": round(float(r[4]) * qty_planned, 4), 
                    "note": r[5], 
                    "unit_price": r[6] or 0
                } for r in results
            ]

          