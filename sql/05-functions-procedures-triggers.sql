-- =====================================================================
-- 05 - FUNCTIONS, PROCEDURES, TRIGGERS (created by the migrations)
-- =====================================================================

-- FUNCTIONS - called with SELECT ------------------------------------------
SELECT get_order_total(1);
SELECT get_customer_total_spent(1);
SELECT * FROM get_products_by_category('Electronics');

-- use a function inside a normal query
SELECT id, name, get_customer_total_spent(id) AS spent
FROM customers
ORDER BY spent DESC;

-- see the source code of a function
SELECT pg_get_functiondef('get_order_total(integer)'::regprocedure);

-- PROCEDURES - called with CALL -------------------------------------------
-- place_order(customer_id, product_id, quantity, INOUT order_id)
CALL place_order(1, 7, 1, NULL);       -- returns the new order id

CALL place_order(1, 7, 99999, NULL);   -- fails: Not enough stock

-- cancel the order you just created (put its id here)
-- CALL cancel_order(<order id>);

-- TRIGGERS ----------------------------------------------------------------
-- list them
SELECT trigger_name, event_object_table, action_timing, event_manipulation
FROM information_schema.triggers
ORDER BY event_object_table;

-- price history trigger
UPDATE products SET price = price + 50 WHERE name = 'Clean Code';
SELECT * FROM product_price_history ORDER BY id DESC LIMIT 5;
UPDATE products SET price = price - 50 WHERE name = 'Clean Code';

-- order total trigger: add an item and watch total_amount change
SELECT id, total_amount FROM orders WHERE id = 1;
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
VALUES (1, 10, 1, 299.00);
SELECT id, total_amount FROM orders WHERE id = 1;      -- +299
DELETE FROM order_items WHERE order_id = 1 AND product_id = 10;
SELECT id, total_amount FROM orders WHERE id = 1;      -- back to before

-- turn a trigger off / on (e.g. during a big data import)
ALTER TABLE products DISABLE TRIGGER trg_products_price_history;
ALTER TABLE products ENABLE TRIGGER trg_products_price_history;

-- Write your own! A small practice task:
-- Create a trigger that stops anyone from deleting a 'paid' order.
-- Hint:
--   CREATE FUNCTION prevent_paid_order_delete() RETURNS TRIGGER ... AS $$
--   BEGIN
--     IF OLD.status = 'paid' THEN RAISE EXCEPTION 'Paid orders cannot be deleted'; END IF;
--     RETURN OLD;
--   END; $$;
--   CREATE TRIGGER ... BEFORE DELETE ON orders FOR EACH ROW EXECUTE FUNCTION prevent_paid_order_delete();
