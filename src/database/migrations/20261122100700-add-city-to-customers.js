'use strict';

// SCHEMA VERSIONING example.
//
// Imagine the "customers" table is already live with real data, and now the
// business wants a "city" column. We must NOT edit the old create-customers
// migration (it already ran on everyone's database). Instead we add a NEW
// migration. Every developer just runs "npm run db:migrate" and gets the change.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('customers', 'city', {
      type: Sequelize.STRING(100),
      allowNull: true, // existing rows have no city yet, so it must allow NULL
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('customers', 'city');
  },
};
