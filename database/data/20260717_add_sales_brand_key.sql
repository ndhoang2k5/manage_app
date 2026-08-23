ALTER TABLE sales_report_runs
  ADD COLUMN brand_key VARCHAR(32) NOT NULL DEFAULT 'unbee' AFTER id;

ALTER TABLE sales_report_runs
  DROP INDEX uq_sales_report_period;

ALTER TABLE sales_report_runs
  ADD UNIQUE KEY uq_sales_report_brand_period (brand_key, time_start, time_end),
  ADD INDEX idx_sales_report_runs_brand_time (brand_key, time_start, time_end);

ALTER TABLE sales_priority_codes
  ADD COLUMN brand_key VARCHAR(32) NOT NULL DEFAULT 'unbee' AFTER id;

ALTER TABLE sales_priority_codes
  DROP INDEX uq_sales_priority_code;

ALTER TABLE sales_priority_codes
  ADD UNIQUE KEY uq_sales_priority_brand_code (brand_key, code),
  ADD INDEX idx_sales_priority_brand_active (brand_key, is_active);

ALTER TABLE sales_product_stock_current
  ADD COLUMN brand_key VARCHAR(32) NOT NULL DEFAULT 'unbee' FIRST;

ALTER TABLE sales_product_stock_current
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (brand_key, code);
