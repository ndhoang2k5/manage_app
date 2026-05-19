-- Migration: add inventory_check_sales_sync_state
-- Date: 2026-04-22
-- Safe to run multiple times (idempotent).

CREATE TABLE IF NOT EXISTS inventory_check_sales_sync_state (
    id INT PRIMARY KEY,
    last_sync_ms BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Seed single row
INSERT INTO inventory_check_sales_sync_state (id, last_sync_ms)
SELECT 1, 0
WHERE NOT EXISTS (SELECT 1 FROM inventory_check_sales_sync_state WHERE id = 1);

