'use strict';

// POSTGRESQL FUNCTIONS
//
// A function is code that lives INSIDE the database. You call it from SQL:
//   SELECT get_order_total(5);
//
// - It always RETURNS something (a value, or a whole table).
// - It can be used inside SELECT, WHERE, etc. like built-in functions (NOW(), LOWER()).
// - It cannot COMMIT or ROLLBACK (procedures can).
//
// Sequelize has no special API to create functions, so we write raw SQL.
// $$ ... $$ is just PostgreSQL's way to quote a long block of text.

module.exports = {
  async up(queryInterface) {
    // 1) Simple function written in plain SQL (LANGUAGE sql).
    //    STABLE = it only reads data, never changes it (helps the planner).
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION get_order_total(p_order_id INTEGER)
      RETURNS NUMERIC
      LANGUAGE sql
      STABLE
      AS $$
        SELECT COALESCE(SUM(quantity * unit_price), 0)
        FROM order_items
        WHERE order_id = p_order_id;
      $$;
    `);

    // 2) Function written in PL/pgSQL (PostgreSQL's procedural language).
    //    PL/pgSQL gives us variables, IF/ELSE, loops, error handling.
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION get_customer_total_spent(p_customer_id INTEGER)
      RETURNS NUMERIC
      LANGUAGE plpgsql
      STABLE
      AS $$
      DECLARE
        v_total NUMERIC;
      BEGIN
        SELECT COALESCE(SUM(total_amount), 0)
          INTO v_total
        FROM orders
        WHERE customer_id = p_customer_id
          AND status = 'paid';

        RETURN v_total;
      END;
      $$;
    `);

    // 3) Function that returns a TABLE (many rows). Use it like a table:
    //    SELECT * FROM get_products_by_category('Books');
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION get_products_by_category(p_category_name TEXT)
      RETURNS TABLE (
        product_id   INTEGER,
        product_name VARCHAR,
        price        NUMERIC,
        stock        INTEGER
      )
      LANGUAGE sql
      STABLE
      AS $$
        SELECT p.id, p.name, p.price, p.stock
        FROM products p
        JOIN categories c ON c.id = p.category_id
        WHERE c.name ILIKE p_category_name
          AND p.is_active = TRUE
        ORDER BY p.name;
      $$;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP FUNCTION IF EXISTS get_products_by_category(TEXT);');
    await queryInterface.sequelize.query('DROP FUNCTION IF EXISTS get_customer_total_spent(INTEGER);');
    await queryInterface.sequelize.query('DROP FUNCTION IF EXISTS get_order_total(INTEGER);');
  },
};
