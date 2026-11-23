const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// One row = one product inside one order.
// This is the "junction" (or "join") table between orders and products,
// which makes orders <-> products a MANY-TO-MANY relationship.
const OrderItem = sequelize.define(
  'OrderItem',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    orderId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1 },
    },
    // We copy the price at the time of the order.
    // If the product price changes tomorrow, old orders must not change.
    unitPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
  },
  {
    tableName: 'order_items',
    timestamps: false,
  }
);

module.exports = OrderItem;
