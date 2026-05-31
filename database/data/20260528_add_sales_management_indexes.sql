-- Performance indexes for sales management reporting/export.
-- Safe to run multiple times.

SET @db_name := DATABASE();

-- sales_report_runs: optimize time-window filters + ordering by id desc.
SELECT COUNT(1) INTO @idx_runs_time
FROM information_schema.statistics
WHERE table_schema = @db_name
  AND table_name = 'sales_report_runs'
  AND index_name = 'idx_sales_runs_time_window';

SET @sql_runs_time := IF(
  @idx_runs_time = 0,
  'ALTER TABLE sales_report_runs ADD INDEX idx_sales_runs_time_window (time_start, time_end, id)',
  'SELECT "idx_sales_runs_time_window exists"'
);
PREPARE stmt_runs_time FROM @sql_runs_time;
EXECUTE stmt_runs_time;
DEALLOCATE PREPARE stmt_runs_time;

-- sales_report_items: optimize join by run and grouping/filtering by code.
SELECT COUNT(1) INTO @idx_items_run_code
FROM information_schema.statistics
WHERE table_schema = @db_name
  AND table_name = 'sales_report_items'
  AND index_name = 'idx_sales_items_run_code';

SET @sql_items_run_code := IF(
  @idx_items_run_code = 0,
  'ALTER TABLE sales_report_items ADD INDEX idx_sales_items_run_code (run_id, code)',
  'SELECT "idx_sales_items_run_code exists"'
);
PREPARE stmt_items_run_code FROM @sql_items_run_code;
EXECUTE stmt_items_run_code;
DEALLOCATE PREPARE stmt_items_run_code;

-- sales_report_items: optimize code-driven lookups and joins.
SELECT COUNT(1) INTO @idx_items_code_run
FROM information_schema.statistics
WHERE table_schema = @db_name
  AND table_name = 'sales_report_items'
  AND index_name = 'idx_sales_items_code_run';

SET @sql_items_code_run := IF(
  @idx_items_code_run = 0,
  'ALTER TABLE sales_report_items ADD INDEX idx_sales_items_code_run (code, run_id)',
  'SELECT "idx_sales_items_code_run exists"'
);
PREPARE stmt_items_code_run FROM @sql_items_code_run;
EXECUTE stmt_items_code_run;
DEALLOCATE PREPARE stmt_items_code_run;
