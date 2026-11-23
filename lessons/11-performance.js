// LESSON 11: Query performance - smarter indexes, N+1, pagination
// Run: npm run lesson:11
//
// Lesson 9 showed WHAT an index is (Seq Scan vs Index Scan). This lesson is
// about choosing the RIGHT index and writing queries that can use it:
//   composite index column order, partial index, expression index,
//   covering index (Index Only Scan), N+1 queries in the ORM,
//   OFFSET vs keyset pagination, and finding unused indexes.
//
// We create a practice table with 300,000 orders and drop it at the end.

const { QueryTypes } = require('sequelize');
const { sequelize, Customer, Order } = require('../src/models');
const { heading, runLesson } = require('./helper');

// Runs EXPLAIN ANALYZE and prints the plan in a short form:
// only the node names (Index Scan, Sort, ...) and the total execution time.
async function explain(label, sql) {
  const rows = await sequelize.query(`EXPLAIN ANALYZE ${sql}`, { type: QueryTypes.SELECT });
  const lines = rows.map((r) => r['QUERY PLAN']);
  const nodes = lines
    .filter((l) => !l.startsWith('Planning') && !l.startsWith('Execution') && !/^\s+(Filter|Index Cond|Sort Key|Rows Removed|Heap|Buffers|Recheck|Sort Method|Worker|Workers)/.test(l))
    .map((l) => l.replace(/\s+\(cost=.*$/, '').replace('->', '').trim());
  const time = lines.find((l) => l.startsWith('Execution Time')).replace('Execution Time: ', '');

  console.log(`\n--- ${label}`);
  console.log(`    plan: ${nodes.join('  <-  ')}`);
  console.log(`    time: ${time}`);
}

async function run(sql) {
  await sequelize.query(sql);
}

runLesson(async () => {
  heading('1. Practice table: 300,000 orders for 20,000 customers');
  await run('DROP TABLE IF EXISTS perf_orders');
  await run(`
    CREATE TABLE perf_orders (
      id          SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL,
      email       TEXT NOT NULL,
      status      TEXT NOT NULL,
      amount      INTEGER NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL
    )`);
  // ~1% of orders are "pending", the rest "paid"/"cancelled" -> realistic
  await run(`
    INSERT INTO perf_orders (customer_id, email, status, amount, created_at)
    SELECT 1 + g % 20000,
           'User' || (1 + g % 20000) || '@Example.com',
           CASE WHEN g % 100 = 0 THEN 'pending' WHEN g % 7 = 0 THEN 'cancelled' ELSE 'paid' END,
           (random() * 5000)::int,
           NOW() - (g || ' minutes')::interval
    FROM generate_series(1, 300000) AS g`);
  await run('ANALYZE perf_orders');
  console.log('Done.');

  // =========================================================================
  heading('2. Composite index: column ORDER matters');
  // Query: "latest 10 orders of one customer" - very common in real apps.
  const latestOfCustomer = `SELECT * FROM perf_orders WHERE customer_id = 4242 ORDER BY created_at DESC LIMIT 10`;

  await explain('No index', latestOfCustomer);

  // Wrong order: created_at first. The index is sorted by date, so PostgreSQL
  // must walk through it and check customer_id on every entry.
  await run('CREATE INDEX idx_perf_created_customer ON perf_orders (created_at, customer_id)');
  await explain('Index (created_at, customer_id)  <- wrong order', latestOfCustomer);
  await run('DROP INDEX idx_perf_created_customer');

  // Right order: the "=" column first, the ORDER BY column second. PostgreSQL
  // jumps to customer 4242, and its rows are ALREADY sorted by date -> no Sort.
  await run('CREATE INDEX idx_perf_customer_created ON perf_orders (customer_id, created_at)');
  await explain('Index (customer_id, created_at)  <- right order', latestOfCustomer);
  console.log('\nRule: columns used with "=" first, then range / ORDER BY columns.');
  console.log('The same index also helps "WHERE customer_id = ?" alone (leftmost column),');
  console.log('but NOT "WHERE created_at > ?" alone.');

  // =========================================================================
  heading('3. Partial index: index only the rows you search for');
  // Only ~1% of rows are pending, and the app only ever asks for pending ones.
  const pendingQuery = `SELECT id, amount FROM perf_orders WHERE status = 'pending' ORDER BY created_at LIMIT 20`;
  await explain('No index on status', pendingQuery);

  await run('CREATE INDEX idx_perf_status_created_full ON perf_orders (status, created_at)');
  await run(`CREATE INDEX idx_perf_pending_created ON perf_orders (created_at) WHERE status = 'pending'`);
  await explain('With partial index ... WHERE status = \'pending\'', pendingQuery);

  const sizes = await sequelize.query(
    `SELECT indexrelname AS index, pg_size_pretty(pg_relation_size(indexrelid)) AS size
     FROM pg_stat_user_indexes
     WHERE indexrelname IN ('idx_perf_status_created_full', 'idx_perf_pending_created')`,
    { type: QueryTypes.SELECT }
  );
  console.table(sizes);
  console.log('Partial index = much smaller, and faster to keep up to date on INSERT/UPDATE.');
  await run('DROP INDEX idx_perf_status_created_full');

  // =========================================================================
  heading('4. Expression index: when the query wraps the column in a function');
  // Emails are stored in mixed case. To search case-insensitively we use LOWER().
  const byEmail = `SELECT id FROM perf_orders WHERE LOWER(email) = 'user77@example.com'`;

  await run('CREATE INDEX idx_perf_email ON perf_orders (email)');
  await explain('Normal index on email -> NOT used, LOWER(email) is a different value', byEmail);

  await run('CREATE INDEX idx_perf_email_lower ON perf_orders (LOWER(email))');
  await explain('Index on LOWER(email) -> used', byEmail);
  console.log('\nThe index must match the expression in the WHERE exactly.');
  await run('DROP INDEX idx_perf_email');

  // =========================================================================
  heading('5. Covering index (INCLUDE): answer the query from the index alone');
  // "Total amount of one customer". The index from step 2 finds the rows, but
  // PostgreSQL still visits the table to read "amount".
  const customerTotal = `SELECT SUM(amount) FROM perf_orders WHERE customer_id = 4242`;
  await run('VACUUM perf_orders'); // updates the "visibility map" -> needed for Index Only Scan
  await explain('Index (customer_id, created_at): reads index + table', customerTotal);

  // INCLUDE (amount) stores amount inside the index (not sorted by it, just carried along)
  await run('CREATE INDEX idx_perf_customer_inc_amount ON perf_orders (customer_id) INCLUDE (amount)');
  await run('VACUUM perf_orders');
  await explain('Index (customer_id) INCLUDE (amount): Index ONLY Scan', customerTotal);

  // =========================================================================
  heading('6. OFFSET vs keyset pagination (deep pages)');
  // OFFSET 250000 means: read 250,010 rows and throw away 250,000. Page 1 is
  // fast, page 25,000 is slow. Keyset ("give me rows AFTER the last id I saw")
  // jumps straight there with the primary key index - every page is fast.
  await explain('OFFSET 250000 LIMIT 10', 'SELECT id, amount FROM perf_orders ORDER BY id LIMIT 10 OFFSET 250000');
  await explain('Keyset: WHERE id > 250000 LIMIT 10', 'SELECT id, amount FROM perf_orders WHERE id > 250000 ORDER BY id LIMIT 10');
  console.log('\nSequelize keyset: Order.findAll({ where: { id: { [Op.gt]: lastId } }, order: [["id","ASC"]], limit: 10 })');

  // =========================================================================
  heading('7. The N+1 problem in the ORM (on the real shop tables)');
  // We count how many SQL queries each approach sends to the database.
  let queries = 0;
  const count = () => queries++;

  // BAD: 1 query for customers + 1 query PER customer = N+1 queries
  queries = 0;
  const customers = await Customer.findAll({ logging: count });
  for (const c of customers) {
    await c.getOrders({ logging: count });
  }
  console.log(`Lazy loading in a loop  : ${queries} queries  (1 + ${customers.length} customers)`);

  // GOOD: include -> ONE query with a JOIN
  queries = 0;
  await Customer.findAll({ include: [{ model: Order, as: 'orders' }], logging: count });
  console.log(`include (eager loading) : ${queries} query`);
  console.log('With 1,000 customers the first way sends 1,001 queries. Always look for loops around await.');

  // =========================================================================
  heading('8. Which indexes are actually used? (pg_stat_user_indexes)');
  // idx_scan = how many times PostgreSQL used the index since stats were reset.
  // An index with 0 scans for weeks only costs disk space and slows writes.
  // Stats are written with a small delay; this forces them out now (PostgreSQL 15+).
  await run('SELECT pg_stat_force_next_flush()');
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const usage = await sequelize.query(
    `SELECT relname AS "table", indexrelname AS index, idx_scan AS times_used,
            pg_size_pretty(pg_relation_size(indexrelid)) AS size
     FROM pg_stat_user_indexes
     WHERE relname IN ('perf_orders', 'products', 'orders', 'customers')
     ORDER BY relname, idx_scan DESC`,
    { type: QueryTypes.SELECT }
  );
  console.table(usage);

  await run('DROP TABLE perf_orders');
  console.log('\nPractice table dropped.');
  console.log('Checklist: EXPLAIN ANALYZE first, index what you filter/sort on, avoid N+1, avoid big OFFSETs.');
});
