'use strict';

// STORED PROCEDURES
//
// A procedure is also code inside the database, but you run it with CALL:
//   CALL place_order(1, 3, 2, NULL);
//
// Function vs Procedure (simple version):
//   Function  -> SELECT my_func()   -> must RETURN a value, usable inside queries
//   Procedure -> CALL my_proc()     -> does a JOB (insert/update many tables),
//                                      can return values only via INOUT/OUT params,
//                                      can COMMIT/ROLLBACK inside (PostgreSQL 11+)
//
// Why put logic in the database at all?
//   - one round trip instead of many queries from Node.js
//   - the same rules apply for every app that uses this database
// Downside: logic is split between JS and SQL, which is harder to test/debug.
// So use it for small, important, data-heavy jobs - not for everything.

module.exports = {
  async up(queryInterface) {
    // Places an order for ONE product. If anything fails (bad quantity, no stock,
    // unknown customer), RAISE EXCEPTION stops it and NOTHING is saved.
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE PROCEDURE place_order(
        p_customer_id INTEGER,
        p_product_id  INTEGER,
        p_quantity    INTEGER,
        INOUT p_order_id INTEGER DEFAULT NULL   -- the new order id comes back here
      )
      LANGUAGE plpgsql
      AS $$
      DECLARE
        v_price NUMERIC;
        v_stock INTEGER;
      BEGIN
        IF p_quantity IS NULL OR p_quantity <= 0 THEN
          RAISE EXCEPTION 'Quantity must be greater than 0';
        END IF;

        -- FOR UPDATE locks this product row until we finish.
        -- If two people buy the last item at the same time, the second one
        -- waits here, then sees the updated stock. No overselling.
        SELECT price, stock
          INTO v_price, v_stock
        FROM products
        WHERE id = p_product_id AND is_active = TRUE
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Product % not found or not active', p_product_id;
        END IF;

        IF v_stock < p_quantity THEN
          RAISE EXCEPTION 'Not enough stock for product %. Available: %, requested: %',
            p_product_id, v_stock, p_quantity;
        END IF;

        INSERT INTO orders (customer_id)
        VALUES (p_customer_id)
        RETURNING id INTO p_order_id;

        -- the trigger on order_items will update orders.total_amount for us
        INSERT INTO order_items (order_id, product_id, quantity, unit_price)
        VALUES (p_order_id, p_product_id, p_quantity, v_price);

        UPDATE products
        SET stock = stock - p_quantity
        WHERE id = p_product_id;
      END;
      $$;
    `);

    // Cancels an order and puts the stock back.
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE PROCEDURE cancel_order(p_order_id INTEGER)
      LANGUAGE plpgsql
      AS $$
      DECLARE
        v_status TEXT;
      BEGIN
        SELECT status INTO v_status
        FROM orders
        WHERE id = p_order_id
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Order % not found', p_order_id;
        END IF;

        IF v_status = 'cancelled' THEN
          RAISE EXCEPTION 'Order % is already cancelled', p_order_id;
        END IF;

        -- give back the stock of every product in this order
        UPDATE products p
        SET stock = p.stock + oi.quantity
        FROM order_items oi
        WHERE oi.order_id = p_order_id
          AND oi.product_id = p.id;

        UPDATE orders
        SET status = 'cancelled'
        WHERE id = p_order_id;
      END;
      $$;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP PROCEDURE IF EXISTS cancel_order(INTEGER);');
    await queryInterface.sequelize.query(
      'DROP PROCEDURE IF EXISTS place_order(INTEGER, INTEGER, INTEGER, INTEGER);'
    );
  },
};
