# Quản lý đơn nhập hàng
# Nghiệp vụ:

# Tạo đơn nhập hàng
# Xác nhận đơn
# Nhận hàng → cập nhật kho
# Hủy đơn

from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date
from entities.purchase import SupplierCreateRequest, PurchaseOrderCreateRequest

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

    # 2. Tạo Phiếu Nhập & Tăng kho (QUAN TRỌNG)
    def create_purchase_order(self, data: PurchaseOrderCreateRequest):
        try:
            # A. Tính tổng tiền (Total Amount)
            total_amount = sum(item.quantity * item.unit_price for item in data.items)
            order_date = data.order_date if data.order_date else date.today()

            # B. Insert vào bảng Header (purchase_orders)
            query_po = text("""
                INSERT INTO purchase_orders (warehouse_id, supplier_id, po_code, order_date, total_amount, status)
                VALUES (:wid, :sid, :code, :date, :total, 'completed')
            """)
            self.db.execute(query_po, {
                "wid": data.warehouse_id,
                "sid": data.supplier_id,
                "code": data.po_code,
                "date": order_date,
                "total": total_amount
            })
            
            # Lấy ID phiếu vừa tạo
            po_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            # C. Xử lý từng món hàng (Loop)
            query_item = text("""
                INSERT INTO purchase_order_items (purchase_order_id, product_variant_id, quantity, unit_price, subtotal)
                VALUES (:poid, :vid, :qty, :price, :sub)
            """)

            # Câu lệnh Insert hoặc Update kho (Nếu có rồi thì cộng dồn, chưa có thì tạo mới)
            # Đây là kỹ thuật "Upsert" trong MySQL
            query_stock = text("""
                INSERT INTO inventory_stocks (warehouse_id, product_variant_id, quantity_on_hand)
                VALUES (:wid, :vid, :qty)
                ON DUPLICATE KEY UPDATE quantity_on_hand = quantity_on_hand + :qty
            """)

            # Câu lệnh ghi lịch sử giao dịch
            query_trans = text("""
                INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id)
                VALUES (:wid, :vid, 'purchase_in', :qty, :ref)
            """)

            for item in data.items:
                # 1. Lưu chi tiết phiếu
                self.db.execute(query_item, {
                    "poid": po_id,
                    "vid": item.product_variant_id,
                    "qty": item.quantity,
                    "price": item.unit_price,
                    "sub": item.quantity * item.unit_price
                })

                # 2. Cộng kho (Tăng tồn kho ngay lập tức)
                self.db.execute(query_stock, {
                    "wid": data.warehouse_id,
                    "vid": item.product_variant_id,
                    "qty": item.quantity
                })

                # 3. Ghi log lịch sử (Để sau này biết tại sao kho tăng)
                self.db.execute(query_trans, {
                    "wid": data.warehouse_id,
                    "vid": item.product_variant_id,
                    "qty": item.quantity,
                    "ref": po_id
                })

            # D. Commit transaction (Lưu tất cả)
            self.db.commit()
            return {"status": "success", "message": f"Nhập kho thành công PO: {data.po_code}", "po_id": po_id}

        except Exception as e:
            self.db.rollback() # Nếu lỗi 1 dòng thì hủy hết để tránh sai lệch tiền/hàng
            raise Exception(f"Lỗi nhập hàng: {str(e)}")