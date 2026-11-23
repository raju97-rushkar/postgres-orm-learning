'use strict';

// MIGRATION = a file that changes the database structure, step by step.
//   up()   -> apply the change    (npm run db:migrate)
//   down() -> undo the change     (npm run db:migrate:undo)
//
// sequelize-cli remembers which files already ran in a table called
// "SequelizeMeta". So each file runs only once, in order of the file name
// (that's why the name starts with a date/time).

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('customers', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true, // becomes SERIAL in PostgreSQL
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      email: {
        type: Sequelize.STRING(150),
        allowNull: false,
        unique: true, // PostgreSQL creates an index for every UNIQUE column
      },
      created_at: {
        type: Sequelize.DATE, // TIMESTAMP WITH TIME ZONE
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('customers');
  },
};
