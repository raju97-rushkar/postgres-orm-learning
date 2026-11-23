-- =====================================================================
-- 04 - INDEXES & EXPLAIN
-- (lesson 9 does the same with 200,000 rows from Node.js)
-- =====================================================================

-- See all indexes of a table
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'orders';

-- EXPLAIN = show the plan (does NOT run the query)
EXPLAIN SELECT * FROM orders WHERE customer_id = 1;

-- EXPLAIN ANALYZE = run the query and show the real time
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 1;

-- On tiny tables you'll see "Seq Scan" even with an index - reading 6 rows
-- directly is faster than using an index. To force index usage for learning:
SET enable_seqscan = off;
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 1;
SET enable_seqscan = on;   -- turn it back on! (only for this session anyway)

-- How to read a plan (bottom-up, most indented runs first):
--   Seq Scan          -> reads all rows
--   Index Scan        -> uses the index, then reads the row from the table
--   Index Only Scan   -> everything needed is IN the index (fastest)
--   Bitmap Heap Scan  -> index finds many rows, then reads them in disk order
--   cost=0.00..1.07   -> planner's estimate (units, not ms)
--   rows=6            -> estimated / actual rows
--   actual time       -> real ms (only with ANALYZE)

-- Index types ---------------------------------------------------------------
-- B-tree (default): =, <, >, BETWEEN, ORDER BY, LIKE 'abc%'
CREATE INDEX idx_demo_btree ON customers (city);

-- Expression index: for WHERE LOWER(email) = ...
CREATE INDEX idx_demo_lower_email ON customers (LOWER(email));

-- Partial index: only some rows
CREATE INDEX idx_demo_pending ON orders (created_at) WHERE status = 'pending';

-- Composite index: column order matters (equality columns first)
CREATE INDEX idx_demo_composite ON products (category_id, price);

-- (GIN index for JSONB / arrays / full-text search, BRIN for huge time-series tables)

-- clean up the demo indexes
DROP INDEX IF EXISTS idx_demo_btree;
DROP INDEX IF EXISTS idx_demo_lower_email;
DROP INDEX IF EXISTS idx_demo_pending;
DROP INDEX IF EXISTS idx_demo_composite;

-- Is an index actually used? (idx_scan = how many times)
SELECT relname AS table_name, indexrelname AS index_name, idx_scan
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Optimization checklist ----------------------------------------------------
-- 1. SELECT only the columns you need (not SELECT *)
-- 2. Index the columns used in WHERE / JOIN / ORDER BY
-- 3. Don't wrap indexed columns in functions in WHERE (or use an expression index)
-- 4. Avoid N+1 queries from the ORM -> use include (JOIN)
-- 5. Use LIMIT + pagination for big lists
-- 6. Run ANALYZE after loading lots of data (autovacuum usually does it)
-- 7. Measure with EXPLAIN ANALYZE before and after - don't guess
