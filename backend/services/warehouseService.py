# Quản lý kho:

# Tạo / sửa kho
# Danh sách kho
# Check kho có hợp lệ không
# Liên kết kho–sản phẩm
from sqlalchemy.orm import Session
from sqlalchemy import text
from entities.warehouse import WarehouseCreateRequest, BrandCreateRequest
from entities.warehouse import TransferCreateRequest, WarehouseUpdateRequest
from typing import List, Optional


class WarehouseService:
    def __init__(self, db: Session):
        self.db = db

    # 1. Tạo Brand mới
    def create_brand(self, data: BrandCreateRequest):
        try:
            query = text("INSERT INTO brands (name) VALUES (:name)")
            self.db.execute(query, {"name": data.name})
            self.db.commit()
            return {"status": "success", "message": f"Đã tạo Brand: {data.name}"}
        except Exception as e:
            self.db.rollback()
            raise e

    # 2. Tạo Kho mới
    def create_warehouse(self, data: WarehouseCreateRequest):
        try:
            # Kiểm tra xem Brand ID có tồn tại không
            check_brand = self.db.execute(text("SELECT id FROM brands WHERE id = :bid"), {"bid": data.brand_id}).fetchone()
            if not check_brand:
                raise Exception("Brand ID không tồn tại!")

            query = text("""
                INSERT INTO warehouses (brand_id, name, is_central, address)
                VALUES (:bid, :name, :central, :addr)
            """)
            self.db.execute(query, {
                "bid": data.brand_id,
                "name": data.name,
                "central": data.is_central,
                "addr": data.address
            })
            self.db.commit()
            return {"status": "success", "message": f"Đã tạo kho: {data.name}"}
        except Exception as e:
            self.db.rollback()
            raise e

    # 3. Lấy danh sách kho (CÓ PHÂN QUYỀN)
    def get_all_warehouses(self, allowed_ids: Optional[List[int]] = None):
        sql = """
            SELECT w.id, w.name, b.name as brand_name, w.address,
                   CASE WHEN w.is_central = 1 THEN 'Kho Tổng' ELSE 'Xưởng May' END as type_name
            FROM warehouses w
            JOIN brands b ON w.brand_id = b.id
        """

        if allowed_ids is not None:
            if len(allowed_ids) == 0:
                return []
            ids_str = ",".join(map(str, allowed_ids))
            sql += f" WHERE w.id IN ({ids_str})"

        sql += " ORDER BY w.brand_id, w.is_central DESC"

        results = self.db.execute(text(sql)).fetchall()
        
        return [
            {
                "id": row[0],
                "name": row[1],
                "brand_name": row[2],
                "address": row[3],
                "type_name": row[4]
            } for row in results
        ]
        
    # 4. Lấy danh sách Brand (để đổ vào dropdown chọn Brand)
    def get_all_brands(self):
        query = text("SELECT id, name FROM brands")
        results = self.db.execute(query).fetchall()
        return [{"id": r[0], "name": r[1]} for r in results]
    

    # 5. Tạo phiếu điều chuyển kho
    def create_transfer(self, data: TransferCreateRequest):
        try:
            if data.from_warehouse_id == data.to_warehouse_id:
                raise Exception("Kho đi và Kho đến không được trùng nhau")

            # Xử lý từng món hàng
            for item in data.items:
                vid = item.product_variant_id
                qty = item.quantity

                # A. Kiểm tra Kho Đi có đủ hàng không
                stock_check = self.db.execute(text("""
                    SELECT quantity_on_hand FROM inventory_stocks 
                    WHERE warehouse_id = :wid AND product_variant_id = :vid
                """), {"wid": data.from_warehouse_id, "vid": vid}).fetchone()

                current_qty = stock_check[0] if stock_check else 0
                if current_qty < qty:
                    raise Exception(f"Kho nguồn không đủ hàng (ID {vid}). Có {current_qty}, cần {qty}")

                # B. Trừ Kho Đi
                self.db.execute(text("""
                    UPDATE inventory_stocks SET quantity_on_hand = quantity_on_hand - :qty
                    WHERE warehouse_id = :wid AND product_variant_id = :vid
                """), {"qty": qty, "wid": data.from_warehouse_id, "vid": vid})

                # Ghi log Trừ
                self.db.execute(text("""
                    INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity)
                    VALUES (:wid, :vid, 'transfer_out', :qty)
                """), {"wid": data.from_warehouse_id, "vid": vid, "qty": -qty})

                # C. Cộng Kho Đến (Upsert)
                self.db.execute(text("""
                    INSERT INTO inventory_stocks (warehouse_id, product_variant_id, quantity_on_hand)
                    VALUES (:wid, :vid, :qty)
                    ON DUPLICATE KEY UPDATE quantity_on_hand = quantity_on_hand + :qty
                """), {"wid": data.to_warehouse_id, "vid": vid, "qty": qty})

                # Ghi log Cộng
                self.db.execute(text("""
                    INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity)
                    VALUES (:wid, :vid, 'transfer_in', :qty)
                """), {"wid": data.to_warehouse_id, "vid": vid, "qty": qty})

            self.db.commit()
            return {"status": "success", "message": "Điều chuyển kho thành công!"}

        except Exception as e:
            self.db.rollback()
            raise e
    # 6. Cập nhật thông tin kho (Chỉ cho sửa Tên và Địa chỉ)
    def update_warehouse(self, warehouse_id: int, data: WarehouseUpdateRequest):
        try:
            # Chỉ cho sửa Tên và Địa chỉ để an toàn cho hệ thống phân quyền
            query = text("UPDATE warehouses SET name = :name, address = :addr WHERE id = :id")
            self.db.execute(query, {"name": data.name, "addr": data.address, "id": warehouse_id})
            self.db.commit()
            return {"status": "success", "message": "Cập nhật thông tin kho thành công"}
        except Exception as e:
            self.db.rollback()
            raise e

    # 7. Xóa kho (Kiểm tra kỹ trước khi xóa)
    def delete_warehouse(self, warehouse_id: int):
        try:
            # A. Kiểm tra xem kho có đang chứa hàng không?
            stock = self.db.execute(text("SELECT SUM(quantity_on_hand) FROM inventory_stocks WHERE warehouse_id = :id"), {"id": warehouse_id}).scalar()
            if stock and stock > 0:
                raise Exception(f"Không thể xóa: Kho này đang còn tồn {stock} sản phẩm/vật tư.")

            # B. Kiểm tra xem có đơn hàng nào dính dáng không?
            po = self.db.execute(text("SELECT id FROM purchase_orders WHERE warehouse_id = :id LIMIT 1"), {"id": warehouse_id}).fetchone()
            pro = self.db.execute(text("SELECT id FROM production_orders WHERE warehouse_id = :id LIMIT 1"), {"id": warehouse_id}).fetchone()
            
            if po or pro:
                raise Exception("Không thể xóa: Kho này đã phát sinh các đơn hàng (Mua/Sản xuất).")

            # C. Nếu sạch sẽ -> Xóa
            # Do ON DELETE CASCADE nên user_permissions sẽ tự xóa theo
            # Tuy nhiên cần xóa inventory_stocks (dù bằng 0) trước
            self.db.execute(text("DELETE FROM inventory_stocks WHERE warehouse_id = :id"), {"id": warehouse_id})
            self.db.execute(text("DELETE FROM inventory_transactions WHERE warehouse_id = :id"), {"id": warehouse_id})
            self.db.execute(text("DELETE FROM warehouses WHERE id = :id"), {"id": warehouse_id})

            self.db.commit()
            return {"status": "success", "message": "Đã xóa kho khỏi hệ thống."}
        except Exception as e:
            self.db.rollback()
            raise e