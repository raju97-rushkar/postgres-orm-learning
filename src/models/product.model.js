const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Product = sequelize.define(
  'Product',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    categoryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    // DECIMAL is exact (good for money). FLOAT is not: 0.1 + 0.2 = 0.30000000000000004
    // Note: the "pg" driver returns DECIMAL as a STRING ("499.00"), not a number,
    // so that no precision is lost. Use Number(product.price) when you need math.
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: { min: 0 },
    },
    stock: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      // The database ALSO has a CHECK (stock >= 0) constraint.
      // This JS validation only runs for create()/save(), not for raw SQL
      // or decrement(). The DB constraint protects us always.
      validate: { min: 0 },
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'products',
    timestamps: true,
  }
);

module.exports = Product;
