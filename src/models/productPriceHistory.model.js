const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// We never insert into this table from JS.
// A TRIGGER on "products" writes a row here whenever a price changes.
const ProductPriceHistory = sequelize.define(
  'ProductPriceHistory',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    oldPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    newPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    changedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'product_price_history',
    timestamps: false,
  }
);

module.exports = ProductPriceHistory;
