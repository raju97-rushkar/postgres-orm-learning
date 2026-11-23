// LESSON 13: Constraints, validations and relationships (ON DELETE rules)
// Run: npm run lesson:13   (needs migration 20261123100000 -> npm run db:migrate)
//
// Two layers protect your data:
//
//   1. Sequelize VALIDATION (in the model, JavaScript side)
//      - runs BEFORE the SQL is sent, gives friendly messages
//      - can be skipped: raw SQL, bulk updates with validate:false, other apps
//
//   2. PostgreSQL CONSTRAINTS (in the database, created by migrations)
//      - NOT NULL, UNIQUE, CHECK, FOREIGN KEY, PRIMARY KEY
//      - can NEVER be skipped -> the last line of defence
//
// Rule of thumb: put every important rule in the DATABASE. Add model
// validation on top for nicer error messages.
//
// All changes in this lesson are rolled back.

const { QueryTypes, ValidationError, UniqueConstraintError } = require('sequelize');
const { sequelize, Customer, Category, Product, Order, OrderItem } = require('../src/models');
const { heading, runLesson } = require('./helper');

// Prints which kind of error we got and which constraint caused it
function explainError(err) {
  if (err instanceof ValidationError && !(err instanceof UniqueConstraintError)) {
    // Sequelize validation: no SQL was sent at all
    return `ValidationError (JS, no SQL sent): ${err.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`;
  }
  const code = err.parent?.code;
  const constraint = err.parent?.constraint || err.index;
  // NOT NULL errors have no constraint name, only the column
  const where = constraint ? `constraint="${constraint}"` : `column="${err.parent?.column}"`;
  return `${err.name} (PostgreSQL code ${code}) ${where}`;
}

// Runs fn inside a transaction that is ALWAYS rolled back
async function tryAndRollback(label, fn) {
  const t = await sequelize.transaction();
  try {
    const result = await fn(t);
    console.log(`  OK   ${label}${result ? ` -> ${result}` : ''}`);
  } catch (err) {
    console.log(`  FAIL ${label}\n       ${explainError(err)}`);
  } finally {
    await t.rollback();
  }
}

runLesson(async () => {
  // =========================================================================
  heading('1. Every constraint in our database (from the pg_constraint catalog)');
  const constraints = await sequelize.query(
    `SELECT conrelid::regclass AS "table",
            conname            AS name,
            CASE contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'f' THEN 'FOREIGN KEY'
                         WHEN 'u' THEN 'UNIQUE'      WHEN 'c' THEN 'CHECK' END AS type,
            CASE confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'r' THEN 'RESTRICT'
                             WHEN 'n' THEN 'SET NULL' WHEN 'a' THEN 'NO ACTION' END AS on_delete,
            pg_get_constraintdef(oid) AS definition
     FROM pg_constraint
     WHERE connamespace = 'public'::regnamespace
       AND conrelid::regclass::text IN ('customers','customer_profiles','categories','products','orders','order_items')
     ORDER BY 1, 3, 2`,
    { type: QueryTypes.SELECT }
  );
  console.table(constraints);
  console.log('(Unique INDEXES like customers_email_lower_unique are listed in pg_indexes, not here.)');

  const aarav = await Customer.findOne({ where: { email: 'aarav@example.com' } });
  const books = await Category.findOne({ where: { name: 'Books' } });

  // =========================================================================
  heading('2. Sequelize validation - caught in JavaScript, before any SQL');
  await tryAndRollback('email "not-an-email"', (t) =>
    Customer.create({ name: 'Test', email: 'not-an-email' }, { transaction: t }));
  await tryAndRollback('empty name + negative loyalty points', (t) =>
    Customer.create({ name: '', email: 'x@example.com', loyaltyPoints: -10 }, { transaction: t }));

  // You can validate WITHOUT saving - handy for forms
  const draft = Customer.build({ name: 'Draft', email: 'bad', loyaltyPoints: 1.5 });
  try {
    await draft.validate();
  } catch (err) {
    console.log(`  build().validate() without saving -> ${err.errors.map((e) => e.message).join(' | ')}`);
  }

  // =========================================================================
  heading('3. Database constraints - they catch what validation misses');

  // UNIQUE (customers_email_key)
  await tryAndRollback('UNIQUE: same email again', (t) =>
    Customer.create({ name: 'Copy', email: 'aarav@example.com' }, { transaction: t }));

  // UNIQUE expression index from today's migration: LOWER(email)
  await tryAndRollback('UNIQUE on LOWER(email): "AARAV@Example.com"', (t) =>
    Customer.create({ name: 'Copy', email: 'AARAV@Example.com' }, { transaction: t }));

  // FOREIGN KEY: category 999999 does not exist
  await tryAndRollback('FOREIGN KEY: product in category 999999', (t) =>
    Product.create({ categoryId: 999999, name: 'Ghost', price: 10 }, { transaction: t }));

  // CHECK: the model says min: 0, but validate:false skips the model rule.
  // The database still says NO.
  await tryAndRollback('CHECK: loyalty_points = -50 with validate:false', (t) =>
    Customer.update({ loyaltyPoints: -50 }, { where: { id: aarav.id }, validate: false, transaction: t }));

  // CHECK via raw SQL: no model involved at all
  await tryAndRollback('CHECK: raw SQL UPDATE products SET stock = -1', (t) =>
    sequelize.query('UPDATE products SET stock = -1 WHERE id = (SELECT MIN(id) FROM products)', { transaction: t }));

  // NOT NULL via raw SQL
  await tryAndRollback('NOT NULL: raw INSERT without a name', (t) =>
    sequelize.query("INSERT INTO customers (email, created_at, updated_at) VALUES ('noname@example.com', NOW(), NOW())", { transaction: t }));

  // UNIQUE on two columns together: the same product twice in one order
  await tryAndRollback('UNIQUE (order_id, product_id): same product twice in an order', async (t) => {
    const line = await OrderItem.findOne({ transaction: t });
    return OrderItem.create(
      { orderId: line.orderId, productId: line.productId, quantity: 1, unitPrice: line.unitPrice },
      { transaction: t }
    );
  });

  console.log('\nHow to catch them in an API:');
  console.log('  UniqueConstraintError     -> 409 "email already used"');
  console.log('  ForeignKeyConstraintError -> 400 "category does not exist"');
  console.log('  ValidationError           -> 400 with the field messages');
  console.log('  DatabaseError code 23514  -> 400 (CHECK violated)');

  // =========================================================================
  heading('4. Relationships: what happens on DELETE? (ON DELETE rules)');
  // Defined in the migrations, enforced by PostgreSQL:
  //   customer_profiles.customer_id -> customers   ON DELETE CASCADE
  //   orders.customer_id            -> customers   ON DELETE RESTRICT
  //   order_items.order_id          -> orders      ON DELETE CASCADE
  //   order_items.product_id        -> products    ON DELETE RESTRICT
  //   products.category_id          -> categories  ON DELETE RESTRICT

  await tryAndRollback('RESTRICT: delete category "Books" (it has products)', (t) =>
    books.destroy({ transaction: t }));

  await tryAndRollback('RESTRICT: delete customer Aarav (has orders)', (t) =>
    aarav.destroy({ transaction: t }));

  await tryAndRollback('CASCADE: delete one order -> its items are deleted too', async (t) => {
    const order = await Order.findOne({ include: [{ model: OrderItem, as: 'items' }], transaction: t });
    const before = order.items.length;
    await order.destroy({ transaction: t });
    const after = await OrderItem.count({ where: { orderId: order.id }, transaction: t });
    return `order #${order.id}: items ${before} -> ${after}`;
  });

  await tryAndRollback('CASCADE: new customer + profile, delete customer -> profile gone', async (t) => {
    const c = await Customer.create({ name: 'Temp', email: 'temp-cascade@example.com' }, { transaction: t });
    await c.createProfile({ phone: '+91 90000 00000' }, { transaction: t });
    await c.destroy({ transaction: t });
    const profiles = await sequelize.query('SELECT COUNT(*)::int AS n FROM customer_profiles WHERE customer_id = :id', {
      replacements: { id: c.id }, type: QueryTypes.SELECT, transaction: t,
    });
    return `profiles left for customer #${c.id}: ${profiles[0].n}`;
  });

  console.log('\nChoosing a rule:');
  console.log('  CASCADE  -> child cannot live without the parent (order items, profile)');
  console.log('  RESTRICT -> child is important history, block the delete (orders, products)');
  console.log('  SET NULL -> child can live alone (e.g. product.brand_id when a brand is removed)');
});
