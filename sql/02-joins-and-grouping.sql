-- =====================================================================
-- 02 - JOINS, GROUP BY, SUBQUERIES, CTE
-- =====================================================================

-- INNER JOIN: only rows that match in BOTH tables
SELECT p.name AS product, c.name AS category
FROM products p
INNER JOIN categories c ON c.id = p.category_id;

-- LEFT JOIN: ALL rows from the left table, NULL when there is no match
-- (Kabir and Rohan have no profile -> phone is NULL)
SELECT cu.name, pr.phone
FROM customers cu
LEFT JOIN customer_profiles pr ON pr.customer_id = cu.id;

-- "Find rows with NO match" pattern: customers who never ordered
SELECT cu.name
FROM customers cu
LEFT JOIN orders o ON o.customer_id = cu.id
WHERE o.id IS NULL;

-- Joining 4 tables: what did each customer buy?
SELECT cu.name AS customer, o.id AS order_id, o.status, p.name AS product, oi.quantity, oi.unit_price
FROM orders o
JOIN customers   cu ON cu.id = o.customer_id
JOIN order_items oi ON oi.order_id = o.id
JOIN products    p  ON p.id = oi.product_id
ORDER BY o.id;

-- GROUP BY: one result row per group --------------------------------------
SELECT c.name AS category, COUNT(p.id) AS products, SUM(p.stock) AS total_stock
FROM categories c
LEFT JOIN products p ON p.category_id = c.id
GROUP BY c.name
ORDER BY products DESC;

-- Rule: every column in SELECT must be in GROUP BY or inside an aggregate (COUNT, SUM...)

-- HAVING = WHERE for groups (runs AFTER grouping)
SELECT cu.name, COUNT(o.id) AS orders, SUM(o.total_amount) AS spent
FROM customers cu
JOIN orders o ON o.customer_id = cu.id
WHERE o.status = 'paid'          -- WHERE filters rows BEFORE grouping
GROUP BY cu.name
HAVING SUM(o.total_amount) > 1000 -- HAVING filters groups AFTER grouping
ORDER BY spent DESC;

-- SUBQUERY: a query inside a query ----------------------------------------
-- products more expensive than the average
SELECT name, price
FROM products
WHERE price > (SELECT AVG(price) FROM products);

-- products that were never ordered
SELECT name
FROM products
WHERE id NOT IN (SELECT product_id FROM order_items);

-- EXISTS is often faster than IN for big tables
SELECT name
FROM customers cu
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = cu.id AND o.status = 'paid');

-- CTE (WITH): give a name to a subquery, makes long queries readable --------
WITH customer_spending AS (
  SELECT customer_id, SUM(total_amount) AS spent
  FROM orders
  WHERE status = 'paid'
  GROUP BY customer_id
)
SELECT cu.name, COALESCE(cs.spent, 0) AS spent
FROM customers cu
LEFT JOIN customer_spending cs ON cs.customer_id = cu.id
ORDER BY spent DESC;

-- WINDOW FUNCTIONS: calculate across rows WITHOUT collapsing them ----------
-- each product's price vs the average price of its category
SELECT c.name AS category,
       p.name AS product,
       p.price,
       ROUND(AVG(p.price) OVER (PARTITION BY p.category_id), 2) AS category_avg,
       RANK() OVER (PARTITION BY p.category_id ORDER BY p.price DESC) AS price_rank
FROM products p
JOIN categories c ON c.id = p.category_id
ORDER BY c.name, price_rank;
