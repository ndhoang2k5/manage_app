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

    # 5. Cập nhật PO (Đã sửa lỗi tham số 'q' và làm tròn số)
    def update_po(self, po_id: int, data: PurchaseUpdateRequest):
        try:
            # 0. Lấy thông tin chung
            po_header = self.db.execute(text("SELECT warehouse_id FROM purchase_orders WHERE id = :id"), {"id": po_id}).fetchone()
            if not po_header: raise Exception("Không tìm thấy phiếu nhập")
            wid_header = po_header[0]
            total_amount = 0

            # A. Cập nhật dữ liệu vào DB trước (Item & Kho)
            for item in data.items:
                if item.id:
                    # SỬA DÒNG CŨ
                    old_data = self.db.execute(text("SELECT quantity, unit_price, product_variant_id FROM purchase_order_items WHERE id = :id"), {"id": item.id}).fetchone()
                    if old_data:
                        old_qty = float(old_data[0])
                        vid = old_data[2]
                        
                        # Làm tròn chênh lệch để tránh lỗi số lẻ (ví dụ 1.30000007)
                        qty_diff = round(item.quantity - old_qty, 4)
                        
                        # Update Item
                        total_amount += (item.quantity * item.unit_price)
                        self.db.execute(text("UPDATE purchase_order_items SET unit_price=:p, quantity=:q, subtotal=:s WHERE id=:id"), 
                                        {"p": item.unit_price, "q": item.quantity, "s": item.quantity * item.unit_price, "id": item.id})
                        
                        # Update Kho
                        if qty_diff != 0:
                            self.db.execute(text("UPDATE inventory_stocks SET quantity_on_hand = quantity_on_hand + :diff WHERE warehouse_id=:w AND product_variant_id=:v"), {"diff": qty_diff, "w": wid_header, "v": vid})
                            
                            # Sửa lỗi 'diff' -> 'q' ở đây
                            self.db.execute(text("""
                                INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id, note) 
                                VALUES (:w, :v, 'purchase_in', :q, :ref, 'Sửa phiếu nhập')
                            """), {"w": wid_header, "v": vid, "q": qty_diff, "ref": po_id})
                else:
                    # THÊM MỚI
                    if not item.product_variant_id: continue
                    vid = item.product_variant_id
                    total_amount += (item.quantity * item.unit_price)
                    
                    self.db.execute(text("INSERT INTO purchase_order_items (purchase_order_id, product_variant_id, quantity, unit_price, subtotal) VALUES (:oid, :pid, :qty, :price, :sub)"), {"oid": po_id, "pid": vid, "qty": item.quantity, "price": item.unit_price, "sub": item.quantity * item.unit_price})
                    self.db.execute(text("INSERT INTO inventory_stocks (warehouse_id, product_variant_id, quantity_on_hand) VALUES (:w, :v, :q) ON DUPLICATE KEY UPDATE quantity_on_hand = quantity_on_hand + :q"), {"w": wid_header, "v": vid, "q": item.quantity})
                    self.db.execute(text("INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id, note) VALUES (:w, :v, 'purchase_in', :q, :ref, 'Thêm mới vào phiếu')"), {"w": wid_header, "v": vid, "q": item.quantity, "ref": po_id})

            # B. Cập nhật Header
            self.db.execute(text("UPDATE purchase_orders SET po_code=:c, supplier_id=:s, order_date=:d, total_amount=:t WHERE id=:id"), {"c": data.po_code, "s": data.supplier_id, "d": data.order_date, "t": total_amount, "id": po_id})

            # C. TÍNH LẠI GIÁ VỐN (QUÉT TOÀN BỘ LỊCH SỬ)
            pids = [i.product_variant_id for i in data.items if i.product_variant_id]
            for item in data.items:
                if item.id and not item.product_variant_id:
                    pid = self.db.execute(text("SELECT product_variant_id FROM purchase_order_items WHERE id=:id"), {"id": item.id}).scalar()
                    if pid: pids.append(pid)
            
            pids = list(set(pids))

            for pid in pids:
                history = self.db.execute(text("SELECT SUM(quantity), SUM(subtotal) FROM purchase_order_items WHERE product_variant_id = :pid"), {"pid": pid}).fetchone()
                
                total_qty_history = float(history[0] or 0)
                total_val_history = float(history[1] or 0)

                if total_qty_history > 0:
                    new_wac = total_val_history / total_qty_history
                    self.db.execute(text("UPDATE product_variants SET cost_price = :cost WHERE id = :id"), {"cost": new_wac, "id": pid})
                else:
                    self.db.execute(text("UPDATE product_variants SET cost_price = 0 WHERE id = :id"), {"id": pid})

            self.db.commit()
            return {"status": "success", "message": "Cập nhật thành công!"}

        except Exception as e:
            self.db.rollback()
            raise e

    # 6. Xóa Phiếu Nhập & Hoàn tác kho
    def delete_purchase_order(self, po_id: int):
        try:
            # 1. Lấy thông tin PO để biết kho nào
            po = self.db.execute(text("SELECT warehouse_id FROM purchase_orders WHERE id = :id"), {"id": po_id}).fetchone()
            if not po: raise Exception("Phiếu nhập không tồn tại")
            
            wid = po[0]

            # 2. Lấy chi tiết hàng đã nhập để trừ lại kho
            items = self.db.execute(text("SELECT product_variant_id, quantity FROM purchase_order_items WHERE purchase_order_id = :id"), {"id": po_id}).fetchall()
            
            for item in items:
                vid = item[0]
                qty = float(item[1])
                
                # Trừ tồn kho (Revert Stock)
                # Kiểm tra xem có đủ hàng để trừ không (đề phòng đã xuất bán mất rồi)
                current_stock = self.db.execute(text("SELECT quantity_on_hand FROM inventory_stocks WHERE warehouse_id=:w AND product_variant_id=:v"), {"w": wid, "v": vid}).scalar() or 0
                
                if current_stock < qty:
                    raise Exception(f"Không thể xóa phiếu! Sản phẩm ID {vid} trong kho chỉ còn {current_stock}, nhưng phiếu này đã nhập {qty}. (Hàng đã bị xuất đi).")

                # Thực hiện trừ
                self.db.execute(text("""
                    UPDATE inventory_stocks 
                    SET quantity_on_hand = quantity_on_hand - :qty
                    WHERE warehouse_id = :wid AND product_variant_id = :vid
                """), {"qty": qty, "wid": wid, "vid": vid})

                # Ghi log hoàn tác
                self.db.execute(text("""
                    INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id, note)
                    VALUES (:wid, :vid, 'purchase_in', :qty, :ref, 'Xóa phiếu nhập (Hoàn tác)')
                """), {"wid": wid, "vid": vid, "qty": -qty, "ref": po_id})

            # 3. Xóa dữ liệu trong DB
            self.db.execute(text("DELETE FROM purchase_order_items WHERE purchase_order_id = :id"), {"id": po_id})
            self.db.execute(text("DELETE FROM purchase_orders WHERE id = :id"), {"id": po_id})
            
            self.db.commit()
            return {"status": "success", "message": "Đã xóa phiếu nhập và hoàn tác kho thành công."}

        except Exception as e:
            self.db.rollback()
            raise e 