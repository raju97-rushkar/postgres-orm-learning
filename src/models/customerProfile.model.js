const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// One customer -> at most one profile (ONE-TO-ONE relationship).
// We keep it in a separate table because not every customer fills it.
const CustomerProfile = sequelize.define(
  'CustomerProfile',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true, // unique = only one profile per customer
    },
    phone: {
      type: DataTypes.STRING(20),
    },
    address: {
      type: DataTypes.TEXT,
    },
  },
  {
    tableName: 'customer_profiles',
    timestamps: true,
  }
);

module.exports = CustomerProfile;
