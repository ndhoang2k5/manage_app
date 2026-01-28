from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date
from entities.purchase import SupplierCreateRequest, PurchaseOrderCreateRequest, PurchaseUpdateRequest

class PurchaseService:
    def __init__(self, db: Session):
        self.db = db

    # 1. Tạo Nhà cung cấp
    def create_supplier(self, data: SupplierCreateRequest):
        try:
            query = text("INSERT INTO suppliers (name, phone, address) VALUES (:name, :phone, :addr)")
            self.db.execute(query, {"name": data.name, "phone": data.phone, "addr": data.address})
            self.db.commit()
            return {"status": "success", "message": f"Đã tạo NCC: {data.name}"}
        except Exception as e:
            self.db.rollback()
            raise e
            
    def get_all_suppliers(self):
        results = self.db.execute(text("SELECT id, name, phone FROM suppliers")).fetchall()
        return [{"id": r[0], "name": r[1], "phone": r[2]} for r in results]

    # 2. Tạo Phiếu Nhập & Tăng kho
    def create_purchase_order(self, data: PurchaseOrderCreateRequest):
        try:
            # A. Xử lý NCC
            final_supplier_id = data.supplier_id
            if data.new_supplier_name:
                query_new_sup = text("INSERT INTO suppliers (name) VALUES (:name)")
                self.db.execute(query_new_sup, {"name": data.new_supplier_name})
                final_supplier_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]
            
            if not final_supplier_id:
                raise Exception("Vui lòng chọn hoặc nhập tên Nhà cung cấp!")

            # B. Header
            total_amount = sum(item.quantity * item.unit_price for item in data.items)
            order_date = data.order_date if data.order_date else date.today()

            query_po = text("""
                INSERT INTO purchase_orders (warehouse_id, supplier_id, po_code, order_date, total_amount, status)
                VALUES (:wid, :sid, :code, :date, :total, 'completed')
            """)
            self.db.execute(query_po, {
                "wid": data.warehouse_id,
                "sid": final_supplier_id,
                "code": data.po_code,
                "date": order_date,
                "total": total_amount
            })
            
            po_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            # C. Chi tiết & Kho
            query_item = text("""
                INSERT INTO purchase_order_items (purchase_order_id, product_variant_id, quantity, unit_price, subtotal)
                VALUES (:poid, :vid, :qty, :price, :sub)
            """)
            
            query_stock = text("""
                INSERT INTO inventory_stocks (warehouse_id, product_variant_id, quantity_on_hand)
                VALUES (:wid, :vid, :qty)
                ON DUPLICATE KEY UPDATE quantity_on_hand = quantity_on_hand + :qty
            """)

            query_trans = text("""
                INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id)
                VALUES (:wid, :vid, 'purchase_in', :qty, :ref)
            """)

            for item in data.items:
                # Tính giá vốn bình quân
                current_info = self.db.execute(text("""
                    SELECT pv.cost_price, IFNULL(SUM(s.quantity_on_hand), 0)
                    FROM product_variants pv
                    LEFT JOIN inventory_stocks s ON pv.id = s.product_variant_id
                    WHERE pv.id = :vid GROUP BY pv.id
                """), {"vid": item.product_variant_id}).fetchone()

                current_cost = float(current_info[0]) if (current_info and current_info[0]) else 0
                current_total_qty = float(current_info[1]) if current_info else 0
                
                new_qty = item.quantity
                new_price = item.unit_price
                total_qty_final = current_total_qty + new_qty

                if total_qty_final > 0:
                    new_avg_cost = ((current_total_qty * current_cost) + (new_qty * new_price)) / total_qty_final
                    self.db.execute(text("UPDATE product_variants SET cost_price = :cost WHERE id = :id"), {
                        "cost": new_avg_cost, "id": item.product_variant_id
                    })

                self.db.execute(query_item, {
                    "poid": po_id, "vid": item.product_variant_id,
                    "qty": item.quantity, "price": item.unit_price, "sub": item.quantity * item.unit_price
                })
                self.db.execute(query_stock, {"wid": data.warehouse_id, "vid": item.product_variant_id, "qty": item.quantity})
                self.db.execute(query_trans, {"wid": data.warehouse_id, "vid": item.product_variant_id, "qty": item.quantity, "ref": po_id})

            self.db.commit()
            return {"status": "success", "message": f"Nhập kho thành công PO: {data.po_code}", "po_id": po_id}

        except Exception as e:
            self.db.rollback()
            raise Exception(f"Lỗi nhập hàng: {str(e)}")

    # 3. Lấy danh sách PO
    def get_all_orders(self):
        query = text("""
            SELECT po.id, po.po_code, s.name as supplier_name, w.name as warehouse_name, 
                   po.order_date, po.total_amount, po.status
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            LEFT JOIN warehouses w ON po.warehouse_id = w.id
            ORDER BY po.id DESC
        """)
        results = self.db.execute(query).fetchall()
        
        return [
            {
                "id": r[0], "po_code": r[1], "supplier_name": r[2],
                "warehouse_name": r[3], "order_date": r[4], "total_amount": r[5], "status": r[6]
            } for r in results
        ]

    # --- 4. HÀM MỚI: LẤY CHI TIẾT PO (GET DETAIL) ---
    def get_po_detail(self, po_id: int):
        # A. Header
        query_header = text("SELECT id, po_code, supplier_id, warehouse_id, order_date FROM purchase_orders WHERE id = :id")
        header = self.db.execute(query_header, {"id": po_id}).fetchone()
        if not header: raise Exception("Phiếu nhập không tồn tại")

        # B. Items
        query_items = text("""
            SELECT poi.id, poi.product_variant_id, pv.sku, pv.variant_name, 
                   poi.quantity, poi.unit_price, poi.subtotal
            FROM purchase_order_items poi
            JOIN product_variants pv ON poi.product_variant_id = pv.id
            WHERE poi.purchase_order_id = :id
        """)
        items = self.db.execute(query_items, {"id": po_id}).fetchall()
        
        return {
            "id": header[0],
            "po_code": header[1],
            "supplier_id": header[2],
            "warehouse_id": header[3],
            "order_date": header[4],
            "items": [
                {
                    "id": r[0],
                    "product_variant_id": r[1],
                    "sku": r[2],
                    "name": r[3],
                    "quantity": r[4],
                    "unit_price": r[5],
                    "subtotal": r[6]
                } for r in items
            ]
        }

    # 5. Cập nhật PO
    # 5. Cập nhật Phiếu Nhập (Sửa Giá, Sửa Số Lượng & TÍNH LẠI GIÁ VỐN)
    def update_po(self, po_id: int, data: PurchaseUpdateRequest):
        try:
            # 0. Lấy thông tin chung của phiếu trước (để biết kho nào)
            po_header = self.db.execute(text("SELECT warehouse_id, status FROM purchase_orders WHERE id = :id"), {"id": po_id}).fetchone()
            if not po_header: raise Exception("Không tìm thấy phiếu nhập")
            
            wid_header = po_header[0] # Kho nhập
            status = po_header[1]
            
            total_amount = 0

            # A. Duyệt qua từng item gửi lên
            for item in data.items:
                
                # ====================================================
                # TRƯỜNG HỢP 1: SỬA DÒNG CŨ (CÓ ID) -> GIỮ LOGIC CŨ CỦA BẠN
                # ====================================================
                if item.id:
                    # 1. Lấy dữ liệu CŨ
                    query_old = text("""
                        SELECT poi.quantity, poi.unit_price, poi.product_variant_id, po.warehouse_id 
                        FROM purchase_order_items poi 
                        JOIN purchase_orders po ON poi.purchase_order_id = po.id 
                        WHERE poi.id = :id
                    """)
                    old_data = self.db.execute(query_old, {"id": item.id}).fetchone()
                    
                    if old_data:
                        old_qty = float(old_data[0])
                        old_price = float(old_data[1])
                        vid = old_data[2]
                        wid = old_data[3] # Lấy ID kho
                        
                        new_qty = item.quantity
                        new_price = item.unit_price

                        # --- [LOGIC CŨ] TÍNH LẠI GIÁ VỐN ---
                        current_info = self.db.execute(text("""
                            SELECT pv.cost_price, IFNULL(SUM(s.quantity_on_hand), 0)
                            FROM product_variants pv 
                            LEFT JOIN inventory_stocks s ON pv.id = s.product_variant_id
                            WHERE pv.id = :vid
                            GROUP BY pv.id
                        """), {"vid": vid}).fetchone()

                        if current_info:
                            current_avg_cost = float(current_info[0] or 0)
                            current_total_stock = float(current_info[1] or 0)

                            # Tính giá trị
                            total_value_system = current_total_stock * current_avg_cost
                            old_value_batch = old_qty * old_price
                            new_value_batch = new_qty * new_price
                            
                            # Tổng số lượng mới
                            new_total_stock = current_total_stock - old_qty + new_qty

                            if new_total_stock > 0:
                                # Giá vốn mới
                                new_wac = (total_value_system - old_value_batch + new_value_batch) / new_total_stock
                                self.db.execute(text("UPDATE product_variants SET cost_price = :cost WHERE id = :id"), {"cost": new_wac, "id": vid})
                        # ------------------------------------

                        # 2. Update bảng chi tiết PO
                        new_subtotal = new_qty * new_price
                        total_amount += new_subtotal
                        
                        self.db.execute(text("""
                            UPDATE purchase_order_items 
                            SET unit_price = :price, quantity = :qty, subtotal = :sub 
                            WHERE id = :id
                        """), {"price": new_price, "qty": new_qty, "sub": new_subtotal, "id": item.id})

                        # 3. Update Kho (Chênh lệch)
                        qty_diff = new_qty - old_qty
                        if qty_diff != 0 and status == 'completed':
                            self.db.execute(text("""
                                UPDATE inventory_stocks 
                                SET quantity_on_hand = quantity_on_hand + :diff
                                WHERE warehouse_id = :wid AND product_variant_id = :vid
                            """), {"diff": qty_diff, "wid": wid, "vid": vid})

                            self.db.execute(text("""
                                INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id, note)
                                VALUES (:wid, :vid, 'purchase_in', :diff, :ref, 'Sửa phiếu nhập (SL/Giá)')
                            """), {"wid": wid, "vid": vid, "diff": qty_diff, "ref": po_id})

                # ====================================================
                # TRƯỜNG HỢP 2: THÊM DÒNG MỚI (KHÔNG CÓ ID) -> LOGIC MỚI
                # ====================================================
                else:
                    if not item.product_variant_id: continue # Bỏ qua nếu lỗi

                    vid = item.product_variant_id
                    new_qty = item.quantity
                    new_price = item.unit_price
                    new_subtotal = new_qty * new_price
                    total_amount += new_subtotal

                    # 1. Insert vào DB
                    self.db.execute(text("""
                        INSERT INTO purchase_order_items (purchase_order_id, product_variant_id, quantity, unit_price, subtotal)
                        VALUES (:oid, :pid, :qty, :price, :sub)
                    """), {"oid": po_id, "pid": vid, "qty": new_qty, "price": new_price, "sub": new_subtotal})

                    # 2. Cộng Kho (Full số lượng)
                    if status == 'completed':
                        self.db.execute(text("""
                            INSERT INTO inventory_stocks (warehouse_id, product_variant_id, quantity_on_hand)
                            VALUES (:wid, :pid, :qty)
                            ON DUPLICATE KEY UPDATE quantity_on_hand = quantity_on_hand + :qty
                        """), {"wid": wid_header, "pid": vid, "qty": new_qty})

                        self.db.execute(text("""
                            INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id, note)
                            VALUES (:wid, :pid, 'purchase_in', :qty, :ref, 'Thêm mới vào phiếu cũ')
                        """), {"wid": wid_header, "pid": vid, "qty": new_qty, "ref": po_id})

                    # 3. Tính lại giá vốn (Cho hàng mới thêm)
                    current_info = self.db.execute(text("""
                        SELECT pv.cost_price, IFNULL(SUM(s.quantity_on_hand), 0)
                        FROM product_variants pv 
                        LEFT JOIN inventory_stocks s ON pv.id = s.product_variant_id
                        WHERE pv.id = :vid
                        GROUP BY pv.id
                    """), {"vid": vid}).fetchone()

                    if current_info:
                        current_avg_cost = float(current_info[0] or 0)
                        current_total_stock = float(current_info[1] or 0)
                        
                        # Công thức khi thêm mới: (Tổng cũ + Giá trị mới) / (Lượng cũ + Lượng mới)
                        new_total_value = (current_total_stock * current_avg_cost) + (new_qty * new_price)
                        new_total_stock = current_total_stock + new_qty
                        
                        if new_total_stock > 0:
                            new_wac = new_total_value / new_total_stock
                            self.db.execute(text("UPDATE product_variants SET cost_price = :cost WHERE id = :id"), {"cost": new_wac, "id": vid})

            # B. Cập nhật Header
            self.db.execute(text("""
                UPDATE purchase_orders 
                SET po_code = :code, supplier_id = :sid, order_date = :date, total_amount = :total 
                WHERE id = :id
            """), {
                "code": data.po_code, 
                "sid": data.supplier_id, 
                "date": data.order_date, 
                "total": total_amount, 
                "id": po_id
            })

            self.db.commit()
            return {"status": "success", "message": "Cập nhật phiếu, kho & giá vốn thành công!"}

        except Exception as e:
            self.db.rollback()
            raise e