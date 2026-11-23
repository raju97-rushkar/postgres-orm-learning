const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// A model = a JS class that represents one table.
// Sequelize uses it to build SQL for us (SELECT, INSERT, UPDATE, DELETE).
//
// IMPORTANT: the model does NOT create the table. The table is created by a
// migration (src/database/migrations). The model and the migration must match.
const Customer = sequelize.define(
  'Customer',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Name cannot be empty' },
      },
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: true,
      validate: {
        // This check runs in Node.js BEFORE the query is sent to PostgreSQL
        isEmail: { msg: 'Please give a valid email' },
      },
    },
    // This column was added later by its own migration (...-add-city-to-customers.js)
    city: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    // Added by migration 20261123100000. The DB also has a CHECK (>= 0);
    // this validation just gives a nicer error before the query is sent.
    loyaltyPoints: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        isInt: { msg: 'Loyalty points must be a whole number' },
        min: { args: [0], msg: 'Loyalty points cannot be negative' },
      },
    },
  },
  {
    tableName: 'customers',
    timestamps: true, // created_at + updated_at are filled automatically
  }
);

module.exports = Customer;
