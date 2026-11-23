-- =====================================================================
-- 03 - TRANSACTIONS
-- Run each block line by line in pgAdmin to watch what happens.
-- (pgAdmin's Query Tool has auto-commit ON by default. BEGIN turns it off
--  until you COMMIT or ROLLBACK.)
-- =====================================================================

-- 1) COMMIT - save everything ---------------------------------------------
BEGIN;
  UPDATE products SET stock = stock - 1 WHERE name = 'Learning SQL';
  UPDATE products SET stock = stock + 1 WHERE name = 'Learning SQL';
COMMIT;

-- 2) ROLLBACK - undo everything --------------------------------------------
BEGIN;
  DELETE FROM order_items;                 -- oops!
  SELECT COUNT(*) FROM order_items;        -- 0 ... inside this transaction
ROLLBACK;
SELECT COUNT(*) FROM order_items;          -- all rows are back

-- 3) Error inside a transaction ---------------------------------------------
BEGIN;
  UPDATE products SET stock = stock + 100 WHERE name = 'Clean Code';
  UPDATE products SET stock = -1 WHERE name = 'Clean Code';   -- CHECK fails
  -- now the transaction is "aborted": every next command fails until ROLLBACK
  SELECT 1;
ROLLBACK;   -- the +100 is gone as well

-- 4) SAVEPOINT - undo only part of a transaction ---------------------------
BEGIN;
  UPDATE products SET price = price + 10 WHERE name = 'Cotton T-Shirt';
  SAVEPOINT before_second_change;
  UPDATE products SET price = price + 1000 WHERE name = 'Cotton T-Shirt';  -- mistake
  ROLLBACK TO SAVEPOINT before_second_change;  -- undo only the mistake
  SELECT name, price FROM products WHERE name = 'Cotton T-Shirt';  -- +10 only
ROLLBACK;  -- (we roll back the whole thing to keep the data clean)

-- 5) Row locking: try this with TWO Query Tool windows ----------------------
-- Window A:
BEGIN;
SELECT * FROM products WHERE name = 'Denim Jacket' FOR UPDATE;   -- locks the row
-- Window B (run now): it WAITS until window A finishes
--   UPDATE products SET stock = stock - 1 WHERE name = 'Denim Jacket';
-- Window A:
COMMIT;   -- window B continues immediately

-- 6) Isolation levels ------------------------------------------------------
SHOW transaction_isolation;   -- default: read committed

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
  SELECT stock FROM products WHERE name = 'Learning SQL';
  -- even if another window changes and commits this stock now,
  -- this transaction keeps seeing the SAME value until it ends
  SELECT stock FROM products WHERE name = 'Learning SQL';
COMMIT;
