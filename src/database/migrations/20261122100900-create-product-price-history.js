'use strict';

// This table is filled by a TRIGGER (see ...-create-triggers.js),
// never by our JS code.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('product_price_history', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'products', key: 'id' },
        onDelete: 'CASCADE',
      },
      old_price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      new_price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      changed_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addIndex('product_price_history', ['product_id'], {
      name: 'idx_price_history_product_id',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('product_price_history');
  },
};
