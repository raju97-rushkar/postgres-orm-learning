'use strict';

// SCHEMA VERSIONING example #2 - a migration with SEVERAL steps.
//
// The business wants:
//   1. a "loyalty_points" column on customers (never negative)
//   2. emails unique WITHOUT caring about upper/lower case
//      (today "aarav@example.com" and "AARAV@example.com" could both exist)
//
// Two good habits shown here:
//   - All steps run in ONE transaction. If step 3 fails, steps 1-2 are undone
//     too, so the database is never left "half migrated". (PostgreSQL can roll
//     back schema changes - many other databases can't!)
//   - down() undoes the steps in REVERSE order, so "db:migrate:undo" works.
//
// Try it:  npm run db:migrate:undo   -> column + constraints are gone
//          npm run db:migrate        -> they are back

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // 1. New column. NOT NULL is fine here because of the DEFAULT:
      //    PostgreSQL fills 0 into every existing row.
      await queryInterface.addColumn(
        'customers',
        'loyalty_points',
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        { transaction }
      );

      // 2. A named CHECK constraint. A clear name makes errors readable:
      //    'violates check constraint "customers_loyalty_points_not_negative"'
      await queryInterface.addConstraint('customers', {
        fields: ['loyalty_points'],
        type: 'check',
        where: { loyalty_points: { [Sequelize.Op.gte]: 0 } },
        name: 'customers_loyalty_points_not_negative',
        transaction,
      });

      // 3. Case-insensitive unique email = UNIQUE index on an EXPRESSION.
      //    (A UNIQUE constraint can only list plain columns; an index can use LOWER().)
      await queryInterface.sequelize.query(
        'CREATE UNIQUE INDEX customers_email_lower_unique ON customers (LOWER(email))',
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query('DROP INDEX IF EXISTS customers_email_lower_unique', { transaction });
      await queryInterface.removeConstraint('customers', 'customers_loyalty_points_not_negative', { transaction });
      await queryInterface.removeColumn('customers', 'loyalty_points', { transaction });
    });
  },
};
