-- Migration: add accounting_stock_openings
-- Date: 2026-04-22
-- Safe to run multiple times (idempotent).

CREATE TABLE IF NOT EXISTS accounting_stock_openings (
    product_code VARCHAR(50) PRIMARY KEY,
    opening_qty DECIMAL(15, 2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

