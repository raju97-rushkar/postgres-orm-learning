// LESSON 6: PostgreSQL Functions
// Run: npm run lesson:6
//
// The functions were created by the migration
//   src/database/migrations/20261122101000-create-functions.js
// Open that file to see their code.

const { QueryTypes } = require('sequelize');
const { sequelize, Customer } = require('../src/models');
const { heading, show, runLesson } = require('./helper');

runLesson(async () => {
  heading('1. Built-in functions you use every day');
  const [builtIn] = await sequelize.query(
    `SELECT NOW()                      AS now,
            UPPER('postgres')          AS upper,
            LENGTH('hello')            AS length,
            ROUND(10.567, 1)           AS rounded,
            COALESCE(NULL, 'fallback') AS coalesce,
            CONCAT('Order #', 42)      AS concat`,
    { type: QueryTypes.SELECT }
  );
  show(builtIn);

  heading('2. Our function: get_order_total(order_id) -> one value');
  // We compare the function result with total_amount (kept up to date by a trigger).
  const orders = await sequelize.query(
    `SELECT id, status, total_amount, get_order_total(id) AS calculated_total
     FROM orders
     ORDER BY id
     LIMIT 6`,
    { type: QueryTypes.SELECT }
  );
  show(orders);

  heading('3. Calling a function with a parameter (safe way, with replacements)');
  const [{ spent }] = await sequelize.query('SELECT get_customer_total_spent(:customerId) AS spent', {
    replacements: { customerId: 1 },
    type: QueryTypes.SELECT,
  });
  console.log(`Customer #1 spent Rs. ${spent} on paid orders`);

  heading('4. Table function: SELECT * FROM get_products_by_category(...)');
  const books = await sequelize.query('SELECT * FROM get_products_by_category(:category)', {
    replacements: { category: 'Books' },
    type: QueryTypes.SELECT,
  });
  show(books);

  // A table function can be filtered / sorted like a normal table
  const cheapElectronics = await sequelize.query(
    `SELECT product_name, price
     FROM get_products_by_category('Electronics')
     WHERE price < 1500`,
    { type: QueryTypes.SELECT }
  );
  console.log('\nElectronics under Rs. 1500:');
  show(cheapElectronics);

  heading('5. Using our function from the ORM (sequelize.fn)');
  // sequelize.fn('name', ...) works for ANY function, including our own
  const customers = await Customer.findAll({
    attributes: [
      'name',
      [sequelize.fn('get_customer_total_spent', sequelize.col('id')), 'totalSpent'],
    ],
    order: [[sequelize.literal('"totalSpent"'), 'DESC']],
    raw: true,
  });
  show(customers);

  heading('6. List our own functions (from the pg_proc system catalog)');
  const functions = await sequelize.query(
    `SELECT p.proname AS name,
            CASE p.prokind WHEN 'f' THEN 'function' WHEN 'p' THEN 'procedure' END AS kind,
            pg_get_function_arguments(p.oid) AS arguments,
            l.lanname AS language
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     JOIN pg_language l ON l.oid = p.prolang
     WHERE n.nspname = 'public'
     ORDER BY kind, name`,
    { type: QueryTypes.SELECT }
  );
  show(functions);
  console.log('Tip: in pgAdmin see them under Schemas -> public -> Functions / Procedures');
});
