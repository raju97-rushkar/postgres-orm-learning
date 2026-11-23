// LESSON 12: Advanced transactions - savepoints, isolation levels, retries,
//            deadlocks, NOWAIT / SKIP LOCKED, afterCommit
// Run: npm run lesson:12
//
// Lesson 5 showed COMMIT, ROLLBACK and a row lock. Here we look at what
// happens when transactions RUN AT THE SAME TIME, which is what a real server
// with many users does all day.
//
// Every change in this lesson is rolled back or undone, so you can run it again.

const { Transaction, QueryTypes } = require('sequelize');
const { sequelize, Product, Order } = require('../src/models');
const { heading, runLesson } = require('./helper');

const { READ_COMMITTED, REPEATABLE_READ } = Transaction.ISOLATION_LEVELS;

async function stockOf(productId, transaction) {
  const [row] = await sequelize.query('SELECT stock FROM products WHERE id = :id', {
    replacements: { id: productId },
    type: QueryTypes.SELECT,
    transaction,
  });
  return row.stock;
}

// Another transaction changes the stock and COMMITs (= "another user")
async function otherUserAddsStock(productId, by) {
  await sequelize.transaction(async (t) => {
    await Product.increment('stock', { by, where: { id: productId }, transaction: t });
  });
}

// PostgreSQL error codes we care about
const SERIALIZATION_FAILURE = '40001';
const DEADLOCK_DETECTED = '40P01';
const pgCode = (err) => err.parent?.code || err.original?.code;

runLesson(async () => {
  const shirt = await Product.findOne({ where: { name: 'Cotton T-Shirt' } });
  const bottle = await Product.findOne({ where: { name: 'Steel Water Bottle' } });
  const shirtStart = shirt.stock;
  const bottleStart = bottle.stock;

  // =========================================================================
  heading('1. SAVEPOINT - roll back PART of a transaction');
  // Passing { transaction: t } to sequelize.transaction() does NOT start a new
  // transaction; it creates a SAVEPOINT inside t. If the inner part fails,
  // only the inner part is undone and the outer transaction continues.
  const outer = await sequelize.transaction();
  try {
    await shirt.increment('stock', { by: 5, transaction: outer });
    console.log('Outer: shirt stock +5');

    try {
      await sequelize.transaction({ transaction: outer }, async (inner) => {
        await bottle.increment('stock', { by: 7, transaction: inner });
        console.log('Inner (savepoint): bottle stock +7');
        // CHECK constraint products_stock_not_negative -> error
        await bottle.decrement('stock', { by: 100000, transaction: inner });
      });
    } catch (err) {
      console.log(`Inner failed -> ROLLBACK TO SAVEPOINT  (${err.message.split('\n')[0]})`);
    }

    console.log(`Inside outer: shirt ${shirtStart} -> ${await stockOf(shirt.id, outer)} (kept),`
      + ` bottle ${bottleStart} -> ${await stockOf(bottle.id, outer)} (inner +7 undone)`);
  } finally {
    await outer.rollback(); // undo the demo
  }

  // =========================================================================
  heading('2. Isolation levels - what can I see while others COMMIT?');
  // READ COMMITTED (PostgreSQL default): every statement sees the latest
  //   committed data -> reading the same row twice can give two answers
  //   ("non-repeatable read").
  // REPEATABLE READ: the transaction sees ONE snapshot taken at its first
  //   query -> the same answer every time, whatever others commit.
  for (const level of [READ_COMMITTED, REPEATABLE_READ]) {
    const t = await sequelize.transaction({ isolationLevel: level });
    try {
      const first = await stockOf(shirt.id, t);
      await otherUserAddsStock(shirt.id, 1); // someone else commits in between
      const second = await stockOf(shirt.id, t);
      console.log(`${level.padEnd(16)} first read: ${first}, second read: ${second}`
        + (first === second ? '  <- same snapshot' : '  <- changed! (non-repeatable read)'));
    } finally {
      await t.rollback();
    }
  }
  await shirt.decrement('stock', { by: 2 }); // undo the two "other user" commits

  // =========================================================================
  heading('3. Serialization failure + retry (REPEATABLE READ)');
  // Two REPEATABLE READ transactions update the SAME row. The second one
  // cannot just overwrite a change it never saw, so PostgreSQL stops it with
  // error 40001 "could not serialize access". The fix: RETRY the whole transaction.
  const t1 = await sequelize.transaction({ isolationLevel: REPEATABLE_READ });
  const t2 = await sequelize.transaction({ isolationLevel: REPEATABLE_READ });
  try {
    await stockOf(shirt.id, t2); // t2 takes its snapshot now
    await shirt.increment('stock', { by: 1, transaction: t1 });
    const t2Update = shirt.increment('stock', { by: 1, transaction: t2 }); // waits for t1's lock
    await t1.commit();
    await t2Update;
    console.log('t2 succeeded (unexpected)');
  } catch (err) {
    console.log(`t2 failed: code ${pgCode(err)} - ${err.message}`);
  } finally {
    await t2.rollback().catch(() => {});
  }
  await shirt.decrement('stock', { by: 1 }); // undo t1

  // A small retry helper. Use it for REPEATABLE READ / SERIALIZABLE work,
  // and for deadlocks: the second try starts with a fresh snapshot.
  async function withRetry(work, { retries = 3, isolationLevel = REPEATABLE_READ } = {}) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await sequelize.transaction({ isolationLevel }, work);
      } catch (err) {
        const retryable = [SERIALIZATION_FAILURE, DEADLOCK_DETECTED].includes(pgCode(err));
        if (!retryable || attempt >= retries) throw err;
        console.log(`   attempt ${attempt} failed (${pgCode(err)}), retrying...`);
      }
    }
  }

  // Same conflict again, but now the second writer uses withRetry().
  const blocker = await sequelize.transaction({ isolationLevel: REPEATABLE_READ });
  await shirt.increment('stock', { by: 1, transaction: blocker }); // holds the row lock
  let firstTry = true;
  const retried = withRetry(async (t) => {
    await stockOf(shirt.id, t); // snapshot
    if (firstTry) {
      firstTry = false;
      setTimeout(() => blocker.commit(), 200); // blocker commits while we wait
    }
    await shirt.increment('stock', { by: 1, transaction: t });
  });
  await retried;
  console.log(`With withRetry(): succeeded. Stock now ${await stockOf(shirt.id)} (both +1 applied)`);
  await shirt.decrement('stock', { by: 2 }); // undo

  // =========================================================================
  heading('4. Deadlock - two transactions waiting for each other');
  // tA locks shirt, tB locks bottle, then tA wants bottle and tB wants shirt.
  // Neither can continue. PostgreSQL notices after ~1 second (deadlock_timeout),
  // kills ONE of them with 40P01, and the other one continues.
  const lockRow = (id, t) =>
    sequelize.query('SELECT id FROM products WHERE id = :id FOR UPDATE', { replacements: { id }, transaction: t });

  const tA = await sequelize.transaction();
  const tB = await sequelize.transaction();
  await lockRow(shirt.id, tA);
  await lockRow(bottle.id, tB);
  const results = await Promise.allSettled([lockRow(bottle.id, tA), lockRow(shirt.id, tB)]);
  results.forEach((r, i) => {
    const name = i === 0 ? 'tA' : 'tB';
    console.log(`${name}: ${r.status === 'fulfilled' ? 'got the lock' : `killed -> ${pgCode(r.reason)} deadlock detected`}`);
  });
  await tA.rollback().catch(() => {});
  await tB.rollback().catch(() => {});
  console.log('Fix: always lock rows in the SAME order (e.g. sort product ids before locking),');
  console.log('and retry on 40P01 (withRetry above handles it).');

  // =========================================================================
  heading('5. NOWAIT and SKIP LOCKED - don\'t wait for a lock');
  const holder = await sequelize.transaction();
  try {
    // holder locks the shirt row (like a slow checkout in progress)
    await Product.findByPk(shirt.id, { transaction: holder, lock: holder.LOCK.UPDATE });

    // NOWAIT: fail immediately instead of waiting -> show "item busy, try again"
    await sequelize.transaction(async (t) => {
      await sequelize.query('SELECT id FROM products WHERE id = :id FOR UPDATE NOWAIT', {
        replacements: { id: shirt.id },
        transaction: t,
      });
    }).catch((err) => console.log(`NOWAIT      -> error ${pgCode(err)} immediately: ${err.message}`));

    // SKIP LOCKED: just skip rows somebody else has locked. Perfect for job
    // queues: many workers each grab DIFFERENT rows and never block each other.
    await sequelize.transaction(async (t) => {
      const free = await Product.findAll({
        where: { id: [shirt.id, bottle.id] },
        lock: t.LOCK.UPDATE,
        skipLocked: true,
        transaction: t,
      });
      console.log(`SKIP LOCKED -> asked for shirt + bottle, got: ${free.map((p) => p.name).join(', ')}`);
    });
  } finally {
    await holder.rollback();
  }

  // =========================================================================
  heading('6. afterCommit - do side effects only when the data is really saved');
  // Sending an email / message INSIDE the transaction is a bug: if it rolls
  // back, the email is already gone. t.afterCommit() runs only after COMMIT.
  for (const shouldFail of [false, true]) {
    await sequelize.transaction(async (t) => {
      t.afterCommit(() => console.log('   afterCommit: "Order confirmed" email sent'));
      const order = await Order.findOne({ transaction: t });
      await order.update({ status: order.status }, { transaction: t }); // harmless update
      if (shouldFail) throw new Error('payment failed');
    }).then(
      () => console.log('Transaction 1: committed'),
      (err) => console.log(`Transaction 2: rolled back (${err.message}) -> no email sent`)
    );
  }

  // Make sure we left everything as we found it
  console.log(`\nStock check: shirt ${shirtStart} -> ${await stockOf(shirt.id)}, bottle ${bottleStart} -> ${await stockOf(bottle.id)}`);
});
