// LESSON 10: Advanced queries - all JOIN types, subqueries, CTEs, LATERAL
// Run: npm run lesson:10
//
// Lesson 4 showed the basics (WHERE, GROUP BY, one CTE). Here we go further.
// Most of it is raw SQL, because that's where this power lives - and at the
// end you'll see how to use the same ideas from Sequelize.
//
// Tip: copy any query from this file into pgAdmin's Query Tool and play with it.

const { QueryTypes, Op } = require('sequelize');
const { sequelize, Customer } = require('../src/models');
const { heading, show, runLesson } = require('./helper');

// Small helper: run a SELECT and print the rows as a table
async function query(title, sql, replacements = {}) {
  console.log(`\n--- ${title}`);
  const rows = await sequelize.query(sql, { type: QueryTypes.SELECT, replacements });
  console.table(rows);
  return rows;
}

runLesson(async () => {
  // =========================================================================
  heading('1. JOIN types - which rows survive?');
  // INNER JOIN -> only rows that match on BOTH sides
  // LEFT JOIN  -> ALL rows from the left, NULLs where the right has no match
  // RIGHT JOIN -> ALL rows from the right (same as LEFT with the tables swapped)
  // FULL JOIN  -> ALL rows from BOTH sides
  await query(
    'INNER vs LEFT: customers and their profile (Kabir/Rohan have none)',
    `SELECT c.name,
            p.phone                    AS inner_would_show,
            CASE WHEN p.id IS NULL THEN 'only in LEFT JOIN' ELSE 'in both' END AS appears_in
     FROM customers c
     LEFT JOIN customer_profiles p ON p.customer_id = c.id
     ORDER BY c.id`
  );

  await query(
    'RIGHT JOIN: every category, even if it has no active product',
    `SELECT cat.name AS category, COUNT(p.id) AS active_products
     FROM products p
     RIGHT JOIN categories cat ON cat.id = p.category_id AND p.is_active
     GROUP BY cat.name
     ORDER BY cat.name`
  );

  // "(no product)" would be an order line without a product. It never shows
  // up here, because the foreign key on order_items.product_id forbids it.
  await query(
    'FULL OUTER JOIN: products vs order lines - find BOTH kinds of "no match"',
    `SELECT COALESCE(p.name, '(no product)') AS product,
            COUNT(oi.id)                       AS times_ordered
     FROM products p
     FULL OUTER JOIN order_items oi ON oi.product_id = p.id
     GROUP BY p.name
     ORDER BY times_ordered, product`
  );

  // =========================================================================
  heading('2. SELF JOIN - a table joined with itself');
  // "Frequently bought together": two lines of the SAME order, different products.
  // a.product_id < b.product_id keeps each pair once (A+B, not also B+A).
  await query(
    'Products bought together in the same order',
    `SELECT pa.name AS product_a, pb.name AS product_b, COUNT(*) AS together
     FROM order_items a
     JOIN order_items b ON b.order_id = a.order_id AND a.product_id < b.product_id
     JOIN products pa   ON pa.id = a.product_id
     JOIN products pb   ON pb.id = b.product_id
     GROUP BY pa.name, pb.name
     ORDER BY together DESC, product_a`
  );

  // =========================================================================
  heading('3. CROSS JOIN - every combination (a "matrix" report)');
  // customers x categories = one row for EVERY pair, then LEFT JOIN the real
  // purchases. Without the CROSS JOIN, "0" rows would simply be missing.
  await query(
    'Items bought by each customer in each category (0 included)',
    `SELECT c.name AS customer, cat.name AS category,
            COALESCE(SUM(oi.quantity), 0) AS items
     FROM customers c
     CROSS JOIN categories cat
     LEFT JOIN orders o       ON o.customer_id = c.id AND o.status = 'paid'
     LEFT JOIN order_items oi ON oi.order_id = o.id
                              AND oi.product_id IN (SELECT id FROM products WHERE category_id = cat.id)
     WHERE c.email LIKE '%@example.com'
     GROUP BY c.name, cat.name
     ORDER BY c.name, cat.name
     LIMIT 12`
  );

  // =========================================================================
  heading('4. SUBQUERIES - a query inside a query');

  // a) Scalar subquery: returns ONE value, used like a constant
  await query(
    'a) Scalar: products priced above the average',
    `SELECT name, price, (SELECT ROUND(AVG(price), 2) FROM products) AS avg_price
     FROM products
     WHERE price > (SELECT AVG(price) FROM products)
     ORDER BY price DESC`
  );

  // b) Correlated subquery: runs once PER outer row (uses c.id from outside)
  await query(
    'b) Correlated: each customer + their latest order date + order count',
    `SELECT c.name,
            (SELECT MAX(o.created_at)::date FROM orders o WHERE o.customer_id = c.id) AS last_order,
            (SELECT COUNT(*)              FROM orders o WHERE o.customer_id = c.id) AS orders
     FROM customers c
     ORDER BY orders DESC, c.name`
  );

  // c) NOT EXISTS: "rows with no match". Safer than NOT IN, because NOT IN
  //    returns NOTHING if the subquery contains a NULL.
  await query(
    'c) NOT EXISTS: products that were never in a PAID order',
    `SELECT p.name, p.stock, p.is_active
     FROM products p
     WHERE NOT EXISTS (
       SELECT 1 FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE oi.product_id = p.id AND o.status = 'paid'
     )
     ORDER BY p.name`
  );

  // d) Derived table: a subquery in FROM, then query it like a table
  await query(
    'd) Derived table: average order value per customer (paid orders only)',
    `SELECT customer, ROUND(AVG(total), 2) AS avg_order, COUNT(*) AS paid_orders
     FROM (
       SELECT c.name AS customer, o.total_amount AS total
       FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.status = 'paid'
     ) AS paid
     GROUP BY customer
     ORDER BY avg_order DESC`
  );

  // e) ANY / ALL: compare with every value in a list
  await query(
    'e) > ALL: products more expensive than EVERY book',
    `SELECT name, price FROM products
     WHERE price > ALL (SELECT price FROM products p JOIN categories c ON c.id = p.category_id
                        WHERE c.name = 'Books')
     ORDER BY price`
  );

  // =========================================================================
  heading('5. CTEs (WITH) - name your steps, read top to bottom');

  // Several CTEs, each one uses the one before. Much easier to read and debug
  // than 3 nested subqueries. (Run each CTE alone in pgAdmin to debug it.)
  await query(
    'Multiple CTEs: category revenue and its share of total revenue',
    `WITH paid_lines AS (
       SELECT oi.product_id, oi.quantity * oi.unit_price AS line_total
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status = 'paid'
     ),
     category_revenue AS (
       SELECT cat.name AS category, SUM(pl.line_total) AS revenue
       FROM paid_lines pl
       JOIN products p     ON p.id = pl.product_id
       JOIN categories cat ON cat.id = p.category_id
       GROUP BY cat.name
     ),
     grand_total AS (
       SELECT SUM(revenue) AS total FROM category_revenue
     )
     SELECT cr.category, cr.revenue,
            ROUND(100.0 * cr.revenue / gt.total, 1) AS percent
     FROM category_revenue cr CROSS JOIN grand_total gt
     ORDER BY cr.revenue DESC`
  );

  // RECURSIVE CTE: a CTE that refers to itself. Part 1 = start row,
  // part 2 = "next row from the previous one", until the WHERE stops it.
  // Classic use: trees (categories -> sub-categories, employee -> manager).
  // Here: build a list of the last 7 days, so days with ZERO orders also show.
  await query(
    'RECURSIVE CTE: orders per day for the last 7 days (empty days included)',
    `WITH RECURSIVE days AS (
       SELECT CURRENT_DATE - 6 AS day          -- 1) start row
       UNION ALL
       SELECT day + 1 FROM days                -- 2) next row from previous
       WHERE day < CURRENT_DATE                -- 3) stop condition
     )
     SELECT d.day, COUNT(o.id) AS orders, COALESCE(SUM(o.total_amount), 0) AS amount
     FROM days d
     LEFT JOIN orders o ON o.created_at::date = d.day
     GROUP BY d.day
     ORDER BY d.day`
  );

  // A CTE can also CHANGE data (data-modifying CTE) and pass the changed rows
  // on. We run it in a transaction and roll back, so nothing really changes.
  await sequelize.transaction(async (t) => {
    const rows = await sequelize.query(
      `WITH raised AS (
         UPDATE products SET stock = stock + 10
         WHERE stock < 30 AND is_active
         RETURNING name, stock
       )
       SELECT name, stock AS new_stock FROM raised ORDER BY name`,
      { type: QueryTypes.SELECT, transaction: t }
    );
    console.log('\n--- Data-modifying CTE: UPDATE ... RETURNING inside WITH (rolled back)');
    console.table(rows);
    throw new Error('rollback on purpose');
  }).catch((err) => {
    if (err.message !== 'rollback on purpose') throw err;
  });

  // =========================================================================
  heading('6. LATERAL JOIN - "top N per group"');
  // LATERAL lets the subquery use columns of the row on its left, like a
  // for-each loop: for EACH category, take its 2 most expensive products.
  await query(
    'Top 2 most expensive products in each category',
    `SELECT cat.name AS category, top.name AS product, top.price
     FROM categories cat
     CROSS JOIN LATERAL (
       SELECT p.name, p.price FROM products p
       WHERE p.category_id = cat.id
       ORDER BY p.price DESC
       LIMIT 2
     ) AS top
     ORDER BY cat.name, top.price DESC`
  );

  // =========================================================================
  heading('7. Subqueries from Sequelize (sequelize.literal)');
  // When an include/group gets complicated, a literal subquery is often the
  // cleanest way. NEVER put user input inside literal() - SQL injection!
  const customers = await Customer.findAll({
    attributes: [
      'name',
      [sequelize.literal('(SELECT COUNT(*) FROM orders o WHERE o.customer_id = "Customer"."id")'), 'orderCount'],
    ],
    where: {
      // WHERE id IN (subquery)
      id: { [Op.in]:sequelize.literal("(SELECT customer_id FROM orders WHERE status = 'paid')") },
    },
    order: [[sequelize.literal('"orderCount"'), 'DESC']],
  });
  console.log('\nCustomers with at least one paid order + their order count:');
  show(customers);
  console.log('Set SHOW_SQL=true in .env to see the SQL Sequelize built for this.');
});
