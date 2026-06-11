-- Cập nhật chi phí đơn HĐ26ub57 (production_order_id=141)
START TRANSACTION;

UPDATE production_orders
SET
    labor_fee = 17760000.00,
    print_fee = 2220000.00,
    shipping_fee = 300000.00,
    marketing_fee = 600000.00,
    packaging_fee = 2220000.00,
    other_fee = 1825120.00,
    note = '740 sp/5%: 1825120'
WHERE id = 141;

COMMIT;
