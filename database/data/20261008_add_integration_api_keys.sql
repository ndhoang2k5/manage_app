-- Migration: read-only API keys for external integrations
-- Date: 2026-10-08
-- Purpose: Unbee's Google Sheets (Apps Script) pulls BOM, giá vốn and the NPL
--          catalog hourly via GET /api/v1/bom, /api/v1/gia-von, /api/v1/npl.
--          Each key is stored as a SHA-256 hash (plaintext is shown once on
--          creation), can be revoked, and can be limited to a set of brands.
-- Safe to run multiple times (idempotent).

CREATE TABLE IF NOT EXISTS integration_api_keys (
    id INT NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    key_prefix VARCHAR(16) NOT NULL,
    key_hash CHAR(64) NOT NULL,
    brand_ids VARCHAR(255) NULL COMMENT 'CSV brand ids; NULL = all brands',
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP NULL,
    revoked_at TIMESTAMP NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_integration_api_keys_hash (key_hash)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
