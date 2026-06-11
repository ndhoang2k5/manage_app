-- Cleanup invalid sales sync runs that can inflate revenue.
-- Date: 2026-06-01
-- Notes:
-- - Backup before delete for audit/recovery.
-- - Rule: remove runs longer than 24h (should use backfill chunk 24h).

SET @max_window_ms := 86400000;

CREATE TABLE IF NOT EXISTS sales_report_runs_deleted (
    id INT NOT NULL,
    time_start BIGINT NOT NULL,
    time_end BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL,
    raw_payload LONGTEXT,
    created_by INT NULL,
    created_at TIMESTAMP NULL,
    deleted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delete_reason VARCHAR(255) NULL,
    PRIMARY KEY (id),
    INDEX idx_srr_deleted_time (time_start, time_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sales_report_items_deleted (
    id BIGINT NOT NULL,
    run_id INT NOT NULL,
    code VARCHAR(128) NOT NULL,
    name VARCHAR(255) NULL,
    sold_qty DECIMAL(18,4) NOT NULL DEFAULT 0,
    sold_revenue DECIMAL(18,2) NOT NULL DEFAULT 0,
    channels_json TEXT,
    shops_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL,
    deleted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delete_reason VARCHAR(255) NULL,
    PRIMARY KEY (id),
    INDEX idx_sri_deleted_run (run_id),
    INDEX idx_sri_deleted_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO sales_report_items_deleted
    (id, run_id, code, name, sold_qty, sold_revenue, channels_json, shops_count, created_at, delete_reason)
SELECT
    i.id, i.run_id, i.code, i.name, i.sold_qty, i.sold_revenue, i.channels_json, i.shops_count, i.created_at,
    'auto-clean long run (>24h)'
FROM sales_report_items i
JOIN sales_report_runs r ON r.id = i.run_id
WHERE (r.time_end - r.time_start) > @max_window_ms
  AND NOT EXISTS (SELECT 1 FROM sales_report_items_deleted d WHERE d.id = i.id);

INSERT INTO sales_report_runs_deleted
    (id, time_start, time_end, status, raw_payload, created_by, created_at, delete_reason)
SELECT
    r.id, r.time_start, r.time_end, r.status, r.raw_payload, r.created_by, r.created_at,
    'auto-clean long run (>24h)'
FROM sales_report_runs r
WHERE (r.time_end - r.time_start) > @max_window_ms
  AND NOT EXISTS (SELECT 1 FROM sales_report_runs_deleted d WHERE d.id = r.id);

DELETE FROM sales_report_runs
WHERE (time_end - time_start) > @max_window_ms;
