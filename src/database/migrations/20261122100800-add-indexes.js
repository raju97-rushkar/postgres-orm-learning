'use strict';

// INDEXES = like the index at the back of a book. Without one, PostgreSQL has
// to read every row of the table to find matches ("Seq Scan").
//
// PostgreSQL creates an index automatically ONLY for PRIMARY KEY and UNIQUE.
// It does NOT index foreign keys for you, so we add the ones we search by.
//
// Don't index everything: every index makes INSERT/UPDATE a bit slower and
// uses disk space. Index the columns you use in WHERE, JOIN and ORDER BY.

module.exports = {
  async up(queryInterface) {
    // "show all products of a category" + JOINs with categories
    await queryInterface.addIndex('products', ['category_id'], {
      name: 'idx_products_category_id',
    });

    // PARTIAL index: only active products are stored in the index.
    // Smaller index, and we almost always search active products only.
    await queryInterface.addIndex('products', ['name'], {
      name: 'idx_products_active_name',
      where: { is_active: true },
    });

    // COMPOSITE index (two columns): "orders of customer X, newest first".
    // Column order matters! This index also helps "WHERE customer_id = X" alone,
    // but is not useful for "WHERE created_at > ..." alone (see lesson 9).
    await queryInterface.addIndex('orders', ['customer_id', 'created_at'], {
      name: 'idx_orders_customer_id_created_at',
    });

    await queryInterface.addIndex('orders', ['status'], {
      name: 'idx_orders_status',
    });

    // order_items(order_id) is already covered by the UNIQUE (order_id, product_id)
    // constraint, because order_id is its FIRST column. product_id is not.
    await queryInterface.addIndex('order_items', ['product_id'], {
      name: 'idx_order_items_product_id',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('order_items', 'idx_order_items_product_id');
    await queryInterface.removeIndex('orders', 'idx_orders_status');
    await queryInterface.removeIndex('orders', 'idx_orders_customer_id_created_at');
    await queryInterface.removeIndex('products', 'idx_products_active_name');
    await queryInterface.removeIndex('products', 'idx_products_category_id');
  },
};
