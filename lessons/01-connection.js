// LESSON 1: Connecting to PostgreSQL and looking around
// Run: npm run lesson:1
//
// Topics: connection, database -> schema -> table, information_schema

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../src/models');
const { heading, show, runLesson } = require('./helper');

runLesson(async () => {
  heading('1. Check that the connection works');
  // authenticate() runs "SELECT 1+1" - if it fails, it throws an error
  await sequelize.authenticate();
  console.log('Connected!');

  heading('2. Which PostgreSQL server and database are we using?');
  const [info] = await sequelize.query(
    `SELECT version()          AS version,
            current_database() AS database,
            current_user       AS "user",
            current_schema()   AS schema`,
    { type: QueryTypes.SELECT }
  );
  show(info);

  // PostgreSQL structure:
  //   Server (cluster) -> many Databases -> many Schemas -> many Tables
  // "public" is the default schema. Our tables live in shop_learning.public.

  heading('3. All tables in our database');
  // information_schema = built-in tables that describe your database ("metadata")
  const tables = await sequelize.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
    { type: QueryTypes.SELECT }
  );
  show(tables);
  // Notice "SequelizeMeta" - that's where sequelize-cli remembers which migrations already ran

  heading('4. Columns of the "products" table');
  const columns = await sequelize.query(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_name = 'products'
     ORDER BY ordinal_position`,
    { type: QueryTypes.SELECT }
  );
  show(columns);

  heading('5. Foreign keys (relationships between tables)');
  const foreignKeys = await sequelize.query(
    `SELECT tc.table_name   AS "table",
            kcu.column_name AS "column",
            ccu.table_name  AS points_to_table,
            ccu.column_name AS points_to_column
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name = ccu.constraint_name
     WHERE tc.constraint_type = 'FOREIGN KEY'
     ORDER BY tc.table_name`,
    { type: QueryTypes.SELECT }
  );
  show(foreignKeys);

  heading('6. How many rows in each table?');
  for (const { table_name: table } of tables) {
    const [{ count }] = await sequelize.query(`SELECT COUNT(*)::int AS count FROM "${table}"`, {
      type: QueryTypes.SELECT,
    });
    console.log(`${table.padEnd(25)} ${count}`);
  }
});
