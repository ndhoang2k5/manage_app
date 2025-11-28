# backend/services/purchaseService.py

from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date
from entities.purchase import SupplierCreateRequest, PurchaseOrderCreateRequest, POItemRequest

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

    # 2. Tạo Phiếu Nhập & Tăng kho (Đã tích hợp tính giá vốn)
    def create_purchase_order(self, data: PurchaseOrderCreateRequest):
        try:
            # --- BƯỚC 1: XỬ LÝ NHÀ CUNG CẤP ---
            final_supplier_id = data.supplier_id

            # Nếu người dùng nhập tên mới -> Tạo NCC mới ngay lập tức
            if data.new_supplier_name:
                query_new_sup = text("INSERT INTO suppliers (name) VALUES (:name)")
                self.db.execute(query_new_sup, {"name": data.new_supplier_name})
                # Lấy ID vừa tạo
                final_supplier_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]
            
            if not final_supplier_id:
                raise Exception("Vui lòng chọn hoặc nhập tên Nhà cung cấp!")

            # --- BƯỚC 2: TẠO HEADER PHIẾU NHẬP ---
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

            # --- BƯỚC 3: XỬ LÝ TỪNG MÓN HÀNG (LOOP) ---
            
            # Các câu lệnh SQL chuẩn bị sẵn
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
                # === LOGIC QUAN TRỌNG: TÍNH LẠI GIÁ VỐN (Weighted Average Cost) ===
                # 1. Lấy giá vốn hiện tại và tổng tồn kho (toàn hệ thống) trước khi nhập
                current_info = self.db.execute(text("""
                    SELECT 
                        pv.cost_price, 
                        IFNULL(SUM(s.quantity_on_hand), 0) as total_stock
                    FROM product_variants pv
                    LEFT JOIN inventory_stocks s ON pv.id = s.product_variant_id
                    WHERE pv.id = :vid
                    GROUP BY pv.id
                """), {"vid": item.product_variant_id}).fetchone()

                current_cost = float(current_info[0]) if (current_info and current_info[0] is not None) else 0
                current_total_qty = float(current_info[1]) if current_info else 0

                # 2. Tính toán giá mới theo công thức bình quân
                new_qty = item.quantity
                new_price = item.unit_price
                
                # Giá Trị Cũ + Giá Trị Mới
                total_value_old = current_total_qty * current_cost
                total_value_new = new_qty * new_price
                
                # Tổng số lượng sau khi nhập
                total_qty_final = current_total_qty + new_qty

                if total_qty_final > 0:
                    new_avg_cost = (total_value_old + total_value_new) / total_qty_final
                else:
                    new_avg_cost = new_price

                # 3. Cập nhật giá vốn mới vào bảng sản phẩm gốc
                self.db.execute(text("UPDATE product_variants SET cost_price = :cost WHERE id = :id"), {
                    "cost": new_avg_cost,
                    "id": item.product_variant_id
                })
                # ================================================================

                # 4. Lưu chi tiết phiếu nhập
                self.db.execute(query_item, {
                    "poid": po_id, "vid": item.product_variant_id,
                    "qty": item.quantity, "price": item.unit_price, "sub": item.quantity * item.unit_price
                })

                # 5. Cộng kho (Tăng số lượng)
                self.db.execute(query_stock, {
                    "wid": data.warehouse_id, "vid": item.product_variant_id, "qty": item.quantity
                })

                # 6. Ghi log giao dịch
                self.db.execute(query_trans, {
                    "wid": data.warehouse_id, "vid": item.product_variant_id, "qty": item.quantity, "ref": po_id
                })

            self.db.commit()
            return {"status": "success", "message": f"Nhập kho thành công PO: {data.po_code}", "po_id": po_id}

        except Exception as e:
            self.db.rollback()
            raise Exception(f"Lỗi nhập hàng: {str(e)}")
    
    # 3. Lấy danh sách Đơn nhập hàng
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
                "id": r[0],
                "po_code": r[1],
                "supplier_name": r[2],
                "warehouse_name": r[3],
                "order_date": r[4],
                "total_amount": r[5],
                "status": r[6]
            } for r in results
        ]