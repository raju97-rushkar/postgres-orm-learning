'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('order_items', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE', // delete an order -> its items go too
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'products', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT', // can't delete a product that was ever ordered
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      unit_price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
    });

    // The same product should appear only once per order
    // (if the customer wants 3, we store quantity = 3, not 3 rows)
    await queryInterface.addConstraint('order_items', {
      fields: ['order_id', 'product_id'],
      type: 'unique',
      name: 'order_items_order_product_unique',
    });

    await queryInterface.addConstraint('order_items', {
      fields: ['quantity'],
      type: 'check',
      where: { quantity: { [Sequelize.Op.gt]: 0 } },
      name: 'order_items_quantity_positive',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('order_items');
  },
};
