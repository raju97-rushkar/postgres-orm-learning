'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('products', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      category_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'categories', key: 'id' },
        onUpdate: 'CASCADE',
        // RESTRICT = you cannot delete a category while products still use it
        onDelete: 'RESTRICT',
      },
      name: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },
      price: {
        type: Sequelize.DECIMAL(10, 2), // up to 99,999,999.99
        allowNull: false,
      },
      stock: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    // CHECK constraints: rules the database itself enforces.
    // Even a raw SQL UPDATE from pgAdmin can't break them.
    await queryInterface.addConstraint('products', {
      fields: ['stock'],
      type: 'check',
      where: { stock: { [Sequelize.Op.gte]: 0 } },
      name: 'products_stock_not_negative',
    });

    await queryInterface.addConstraint('products', {
      fields: ['price'],
      type: 'check',
      where: { price: { [Sequelize.Op.gte]: 0 } },
      name: 'products_price_not_negative',
    });
  },

  async down(queryInterface) {
    // dropping the table also drops its constraints
    await queryInterface.dropTable('products');
  },
};
