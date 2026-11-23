const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const ORDER_STATUSES = ['pending', 'paid', 'cancelled'];

const Order = sequelize.define(
  'Order',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    // ENUM = the column only accepts these values.
    // In PostgreSQL this becomes a custom type called "enum_orders_status".
    status: {
      type: DataTypes.ENUM(...ORDER_STATUSES),
      allowNull: false,
      defaultValue: 'pending',
    },
    // We never set this from JS. A database TRIGGER keeps it up to date
    // every time an order_item is added, changed or removed. (see lesson 8)
    totalAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: 'orders',
    timestamps: true,
  }
);

Order.STATUSES = ORDER_STATUSES;

module.exports = Order;
