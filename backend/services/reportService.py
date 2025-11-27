# Báo cáo tồn kho
# Báo cáo nhập–xuất–tồn
# Báo cáo theo SKU
# Báo cáo sản xuất

from sqlalchemy.orm import Session
from sqlalchemy import text

class ReportService:
    def __init__(self, db: Session):
        self.db = db

    def get_central_warehouse_dashboard(self, warehouse_id: int):
        # 1. Lấy thông tin Kho Tổng & Brand của nó
        query_info = text("""
            SELECT w.id, w.name, w.brand_id, b.name as brand_name 
            FROM warehouses w
            JOIN brands b ON w.brand_id = b.id
            WHERE w.id = :wid AND w.is_central = 1
        """)
        info = self.db.execute(query_info, {"wid": warehouse_id}).fetchone()
        
        if not info:
            raise Exception("Không tìm thấy Kho Tổng hoặc đây không phải là Kho Tổng!")
        
        brand_id = info[2]

        # 2. Lấy danh sách Xưởng Con (Các kho cùng Brand nhưng không phải Central)
        query_children = text("""
            SELECT id, name, address 
            FROM warehouses 
            WHERE brand_id = :bid AND is_central = 0
        """)
        children = self.db.execute(query_children, {"bid": brand_id}).fetchall()
        list_children = [{"id": r[0], "name": r[1], "address": r[2]} for r in children]

        # 3. Tổng hợp Tồn kho Toàn hệ thống (Kho Tổng + Tất cả Xưởng con)
        # Group by theo Mã hàng để biết tổng lượng vải/cúc của cả Brand đang là bao nhiêu
        query_total_stock = text("""
            SELECT pv.sku, pv.variant_name, p.base_unit,
                   SUM(s.quantity_on_hand) as total_qty,
                   SUM(s.quantity_on_hand * pv.cost_price) as total_value
            FROM inventory_stocks s
            JOIN warehouses w ON s.warehouse_id = w.id
            JOIN product_variants pv ON s.product_variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            WHERE w.brand_id = :bid 
            GROUP BY pv.id, pv.sku, pv.variant_name, p.base_unit
            HAVING total_qty > 0
        """)
        stocks = self.db.execute(query_total_stock, {"bid": brand_id}).fetchall()
        list_stocks = [
            {
                "sku": r[0], 
                "name": r[1], 
                "unit": r[2], 
                "total_quantity": r[3], 
                "total_value": r[4]
            } for r in stocks
        ]

        # 4. Danh sách Đơn nhập hàng (Chỉ của Kho Tổng này)
        query_pos = text("""
            SELECT po.po_code, s.name as supplier_name, po.order_date, po.total_amount, po.status
            FROM purchase_orders po
            JOIN suppliers s ON po.supplier_id = s.id
            WHERE po.warehouse_id = :wid
            ORDER BY po.order_date DESC
            LIMIT 10 -- Lấy 10 đơn gần nhất
        """)
        pos = self.db.execute(query_pos, {"wid": warehouse_id}).fetchall()
        list_pos = [
            {
                "code": r[0], 
                "supplier": r[1], 
                "date": r[2], 
                "amount": r[3], 
                "status": r[4]
            } for r in pos
        ]

        # 5. Tình hình Sản xuất tại các Xưởng con (Các lệnh đang chạy)
        # Để biết xưởng nào đang may cái gì, bao nhiêu
        query_production = text("""
            SELECT po.code, w.name as workshop_name, pv.variant_name as product_name,
                   po.quantity_planned, po.quantity_finished, po.status, po.due_date
            FROM production_orders po
            JOIN warehouses w ON po.warehouse_id = w.id
            JOIN product_variants pv ON po.product_variant_id = pv.id
            WHERE w.brand_id = :bid 
            AND po.status IN ('in_progress', 'draft') -- Chỉ quan tâm cái đang làm
            ORDER BY po.due_date ASC
        """)
        productions = self.db.execute(query_production, {"bid": brand_id}).fetchall()
        list_production = [
            {
                "code": r[0],
                "workshop": r[1],
                "product": r[2],
                "planned": r[3],
                "finished": r[4],
                "status": r[5],
                "due_date": r[6]
            } for r in productions
        ]

        # Trả về cục dữ liệu tổng hợp
        return {
            "info": {"id": info[0], "name": info[1], "brand": info[3]},
            "workshops": list_children,
            "total_inventory": list_stocks,
            "recent_purchases": list_pos,
            "active_production": list_production
        }
    
    def get_workshop_detail(self, warehouse_id: int):
        # A. Thông tin cơ bản
        info = self.db.execute(text("SELECT id, name, address FROM warehouses WHERE id = :wid"), {"wid": warehouse_id}).fetchone()
        if not info: raise Exception("Không tìm thấy kho")

        # B. Tồn kho tại xưởng (Kèm giá trị)
        query_stock = text("""
            SELECT pv.sku, pv.variant_name, p.base_unit, 
                   s.quantity_on_hand, 
                   (s.quantity_on_hand * pv.cost_price) as total_value,
                   p.type -- Để biết là NVL hay Thành phẩm
            FROM inventory_stocks s
            JOIN product_variants pv ON s.product_variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            WHERE s.warehouse_id = :wid AND s.quantity_on_hand > 0
            ORDER BY total_value DESC
        """)
        stocks = self.db.execute(query_stock, {"wid": warehouse_id}).fetchall()
        
        list_stocks = [{
            "sku": r[0], "name": r[1], "unit": r[2], 
            "qty": r[3], "value": r[4], "type": r[5]
        } for r in stocks]

        # C. Các đơn hàng đang may tại xưởng này
        query_orders = text("""
            SELECT code, pv.variant_name, quantity_planned, quantity_finished, status, due_date
            FROM production_orders po
            JOIN product_variants pv ON po.product_variant_id = pv.id
            WHERE po.warehouse_id = :wid
            ORDER BY po.id DESC
        """)
        orders = self.db.execute(query_orders, {"wid": warehouse_id}).fetchall()
        
        list_orders = [{
            "code": r[0], "product": r[1], 
            "planned": r[2], "finished": r[3], 
            "status": r[4], "due_date": r[5]
        } for r in orders]

        return {
            "info": {"id": info[0], "name": info[1], "address": info[2]},
            "inventory": list_stocks,
            "production": list_orders,
            "total_asset_value": sum(item['value'] for item in list_stocks)
        }