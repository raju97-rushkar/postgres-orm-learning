'use strict';

// TRIGGERS
//
// A trigger = "when THIS happens on a table, run THAT function automatically".
//   e.g. AFTER UPDATE ON products -> write a row into product_price_history
//
// Two parts:
//   1. a trigger FUNCTION (RETURNS TRIGGER) - the code to run
//   2. the TRIGGER itself - says on which table and on which event to run it
//
// Inside a trigger function you get special variables:
//   NEW    -> the row after the change  (INSERT, UPDATE)
//   OLD    -> the row before the change (UPDATE, DELETE)
//   TG_OP  -> 'INSERT', 'UPDATE' or 'DELETE'
//
// BEFORE trigger -> runs before the row is saved, can CHANGE the row (NEW)
// AFTER trigger  -> runs after the row is saved, good for logs / other tables
//
// Triggers fire for EVERY change: Sequelize, raw SQL, pgAdmin, another app...
// That's their power. The danger: they are "invisible" when reading JS code,
// so always document them.

const TABLES_WITH_UPDATED_AT = ['customers', 'customer_profiles', 'products', 'orders'];

module.exports = {
  async up(queryInterface) {
    const run = (sql) => queryInterface.sequelize.query(sql);

    // ---------------------------------------------------------------------
    // Trigger 1: keep updated_at correct, even for raw SQL updates.
    // (Sequelize already sets updated_at, but pgAdmin / raw SQL don't.)
    // ---------------------------------------------------------------------
    await run(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        NEW.updated_at := NOW();
        RETURN NEW;  -- BEFORE trigger: the returned row is what gets saved
      END;
      $$;
    `);

    for (const table of TABLES_WITH_UPDATED_AT) {
      await run(`
        CREATE TRIGGER trg_${table}_set_updated_at
        BEFORE UPDATE ON ${table}
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at();
      `);
    }

    // ---------------------------------------------------------------------
    // Trigger 2: audit log of price changes.
    // "UPDATE OF price" + WHEN(...) = only fire when the price really changed.
    // ---------------------------------------------------------------------
    await run(`
      CREATE OR REPLACE FUNCTION log_product_price_change()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        INSERT INTO product_price_history (product_id, old_price, new_price)
        VALUES (NEW.id, OLD.price, NEW.price);

        RETURN NEW;
      END;
      $$;
    `);

    await run(`
      CREATE TRIGGER trg_products_price_history
      AFTER UPDATE OF price ON products
      FOR EACH ROW
      WHEN (OLD.price IS DISTINCT FROM NEW.price)
      EXECUTE FUNCTION log_product_price_change();
    `);

    // ---------------------------------------------------------------------
    // Trigger 3: orders.total_amount is always = sum of its items.
    // It re-uses our get_order_total() function from the functions migration.
    // ---------------------------------------------------------------------
    await run(`
      CREATE OR REPLACE FUNCTION refresh_order_total()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      DECLARE
        v_order_id INTEGER;
      BEGIN
        IF TG_OP = 'DELETE' THEN
          v_order_id := OLD.order_id;   -- on DELETE there is no NEW row
        ELSE
          v_order_id := NEW.order_id;
        END IF;

        UPDATE orders
        SET total_amount = get_order_total(v_order_id)
        WHERE id = v_order_id;

        -- rare case: an item was moved from one order to another
        IF TG_OP = 'UPDATE' AND OLD.order_id <> NEW.order_id THEN
          UPDATE orders
          SET total_amount = get_order_total(OLD.order_id)
          WHERE id = OLD.order_id;
        END IF;

        RETURN NULL;  -- AFTER trigger: the return value is ignored
      END;
      $$;
    `);

    await run(`
      CREATE TRIGGER trg_order_items_refresh_total
      AFTER INSERT OR UPDATE OR DELETE ON order_items
      FOR EACH ROW
      EXECUTE FUNCTION refresh_order_total();
    `);
  },

  async down(queryInterface) {
    const run = (sql) => queryInterface.sequelize.query(sql);

    // drop the triggers first, then the functions they use
    await run('DROP TRIGGER IF EXISTS trg_order_items_refresh_total ON order_items;');
    await run('DROP TRIGGER IF EXISTS trg_products_price_history ON products;');
    for (const table of TABLES_WITH_UPDATED_AT) {
      await run(`DROP TRIGGER IF EXISTS trg_${table}_set_updated_at ON ${table};`);
    }

    await run('DROP FUNCTION IF EXISTS refresh_order_total();');
    await run('DROP FUNCTION IF EXISTS log_product_price_change();');
    await run('DROP FUNCTION IF EXISTS set_updated_at();');
  },
};
