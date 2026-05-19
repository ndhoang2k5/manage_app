-- Migration: one-time bootstrap state for inventory check
-- Date: 2026-04-23
-- Purpose: allow "Đồng bộ tồn đầu KT" to run only once globally (not per period).
-- Safe to run multiple times (idempotent).

CREATE TABLE IF NOT EXISTS inventory_check_bootstrap_state (
    id INT PRIMARY KEY,
    initialized TINYINT(1) NOT NULL DEFAULT 0,
    initialized_at TIMESTAMP NULL,
    initialized_period_month VARCHAR(7) NULL,
    note VARCHAR(255) NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO inventory_check_bootstrap_state (id, initialized)
SELECT 1, 0
WHERE NOT EXISTS (SELECT 1 FROM inventory_check_bootstrap_state WHERE id = 1);

