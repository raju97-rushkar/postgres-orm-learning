-- =====================================================================
-- 01 - SQL BASICS
-- Open pgAdmin -> shop_learning -> Query Tool, paste a query, press F5.
-- Run them one at a time (select the lines, then F5).
-- =====================================================================

-- SELECT: read data ----------------------------------------------------
SELECT * FROM products;                       -- all columns (ok for learning, avoid in real code)
SELECT name, price FROM products;             -- only the columns you need

-- WHERE: filter rows
SELECT name, price FROM products WHERE price > 1000;
SELECT name, price FROM products WHERE price BETWEEN 300 AND 600;
SELECT name FROM products WHERE name ILIKE '%code%';      -- ILIKE = case-insensitive LIKE
SELECT name, city FROM customers WHERE city IN ('Ahmedabad', 'Surat');
SELECT name FROM customers WHERE city IS NULL;            -- NOT "= NULL"! NULL is never equal to anything

-- ORDER BY + LIMIT + OFFSET
SELECT name, price FROM products ORDER BY price DESC LIMIT 3;           -- 3 costliest
SELECT name, price FROM products ORDER BY price DESC LIMIT 3 OFFSET 3;  -- next 3 (page 2)

-- DISTINCT: remove duplicates
SELECT DISTINCT city FROM customers WHERE city IS NOT NULL;

-- Aliases (AS) and calculated columns
SELECT name,
       price,
       price * 0.18          AS gst,
       ROUND(price * 1.18, 2) AS price_with_gst
FROM products;

-- CASE: if / else inside SQL
SELECT name, stock,
       CASE
         WHEN stock = 0  THEN 'Out of stock'
         WHEN stock < 10 THEN 'Low stock'
         ELSE 'In stock'
       END AS stock_status
FROM products
ORDER BY stock;

-- INSERT / UPDATE / DELETE ---------------------------------------------
-- RETURNING gives back the changed row (PostgreSQL feature, very handy)
INSERT INTO categories (name) VALUES ('Sports') RETURNING *;

UPDATE categories SET name = 'Sports & Fitness' WHERE name = 'Sports' RETURNING *;

DELETE FROM categories WHERE name = 'Sports & Fitness' RETURNING *;

-- ALWAYS write the WHERE first when you UPDATE / DELETE.
-- "DELETE FROM categories;" without WHERE deletes EVERY row.

-- Constraints in action: each of these FAILS on purpose -------------------
INSERT INTO customers (name, email) VALUES ('Copy', 'aarav@example.com');  -- UNIQUE email
UPDATE products SET stock = -5 WHERE id = 1;                              -- CHECK stock >= 0
INSERT INTO orders (customer_id) VALUES (99999);                         -- FOREIGN KEY
DELETE FROM categories WHERE name = 'Books';                              -- FK with ON DELETE RESTRICT
