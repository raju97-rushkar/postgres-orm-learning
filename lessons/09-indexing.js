// LESSON 9: Indexes and query optimization with EXPLAIN ANALYZE
// Run: npm run lesson:9
//
// Our shop tables are tiny (10 rows), and for tiny tables PostgreSQL reads the
// whole table anyway because that's faster. To SEE what an index does, we
// create a practice table with 200,000 rows, then drop it at the end.

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../src/models');
const { heading, runLesson } = require('./helper');

// EXPLAIN ANALYZE runs the query and shows HOW PostgreSQL executed it:
//   Seq Scan    = read every row (slow on big tables)
//   Index Scan  = jump straight to the matching rows using an index
//   Bitmap Heap Scan = use the index to find many rows, then read them
async function explain(label, sql) {
  const rows = await sequelize.query(`EXPLAIN ANALYZE ${sql}`, { type: QueryTypes.SELECT });
  const lines = rows.map((r) => r['QUERY PLAN']);
  const time = lines.find((l) => l.startsWith('Execution Time')) || '';
  // The first line can be "Gather" (= PostgreSQL used several CPU workers).
  // The line with "Scan" is the interesting one: HOW the table was read.
  const scanLine = lines.find((l) => l.includes('Scan')) || lines[0];

  console.log(`\n--- ${label}`);
  console.log(`    ${sql.replace(/\s+/g, ' ').trim()}`);
  console.log(`    plan: ${scanLine.replace('->', '').trim()}`);
  console.log(`    ${time}`);
}

runLesson(async () => {
  heading('1. Create a practice table with 200,000 rows');
  await sequelize.query('DROP TABLE IF EXISTS index_practice');
  await sequelize.query(`
    CREATE TABLE index_practice (
      id         SERIAL PRIMARY KEY,
      email      TEXT NOT NULL,
      city       TEXT NOT NULL,
      amount     INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    )
  `);

  // generate_series(1, 200000) = a quick way to create many rows
  await sequelize.query(`
    INSERT INTO index_practice (email, city, amount, created_at)
    SELECT 'user' || g || '@example.com',
           (ARRAY['Ahmedabad', 'Surat', 'Rajkot', 'Mumbai', 'Pune'])[1 + g % 5],
           (random() * 10000)::int,
           NOW() - (g || ' minutes')::interval
    FROM generate_series(1, 200000) AS g
  `);

  // ANALYZE collects statistics so the planner can make good decisions
  await sequelize.query('ANALYZE index_practice');
  console.log('Done.');

  const findByEmail = `SELECT * FROM index_practice WHERE email = 'user150000@example.com'`;
  const findByCityAmount = `SELECT * FROM index_practice WHERE city = 'Surat' AND amount > 9990`;

  heading('2. WITHOUT an index');
  await explain('search by email', findByEmail);
  await explain('search by city + amount', findByCityAmount);

  heading('3. Add indexes');
  await sequelize.query('CREATE INDEX idx_practice_email ON index_practice (email)');
  // composite index: equality column (city) first, range column (amount) second
  await sequelize.query('CREATE INDEX idx_practice_city_amount ON index_practice (city, amount)');
  console.log('Created idx_practice_email and idx_practice_city_amount');

  heading('4. WITH indexes - compare the plan and the time');
  await explain('search by email', findByEmail);
  await explain('search by city + amount', findByCityAmount);

  heading('5. When an index is NOT used');
  // Wrapping the column in a function -> the normal index can't be used
  const lowerEmail = `SELECT * FROM index_practice WHERE LOWER(email) = 'user150000@example.com'`;
  await explain('LOWER(email) = ...  (index on email is ignored)', lowerEmail);

  // Fix: an EXPRESSION index on exactly that expression
  await sequelize.query('CREATE INDEX idx_practice_lower_email ON index_practice (LOWER(email))');
  await sequelize.query('ANALYZE index_practice');
  await explain('same query after CREATE INDEX ... (LOWER(email))', lowerEmail);

  // Composite index (city, amount) is sorted by city first, then amount.
  // Searching amount alone can't "jump" to the rows. At best PostgreSQL reads
  // the WHOLE index - compare this time with the email lookup above.
  await explain(
    'amount only  (2nd column of composite index - no direct jump)',
    `SELECT * FROM index_practice WHERE amount = 5000`
  );

  // LIKE '%...' (leading wildcard) can't use a normal B-tree index
  await explain('LIKE with leading %', `SELECT * FROM index_practice WHERE email LIKE '%150000%'`);

  heading('6. Indexes cost disk space');
  const sizes = await sequelize.query(
    `SELECT pg_size_pretty(pg_relation_size('index_practice')) AS table_size,
            pg_size_pretty(pg_indexes_size('index_practice'))  AS all_indexes_size`,
    { type: QueryTypes.SELECT }
  );
  console.table(sizes);
  console.log('Every index also makes INSERT / UPDATE / DELETE a little slower.');

  heading('7. Indexes on our real shop tables');
  const shopIndexes = await sequelize.query(
    `SELECT tablename AS "table", indexname AS index, indexdef AS definition
     FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename IN ('customers', 'products', 'orders', 'order_items')
     ORDER BY tablename, indexname`,
    { type: QueryTypes.SELECT }
  );
  for (const idx of shopIndexes) {
    console.log(`${idx.table.padEnd(12)} ${idx.definition.replace(/^CREATE (UNIQUE )?INDEX \S+ ON public\./, '')}`);
  }

  await sequelize.query('DROP TABLE index_practice');
  console.log('\nPractice table dropped.');
});
