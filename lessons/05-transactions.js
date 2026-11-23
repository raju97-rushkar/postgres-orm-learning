// LESSON 5: Transactions
// Run: npm run lesson:5
//
// A TRANSACTION groups many queries into ONE unit: either ALL of them are saved
// (COMMIT), or NONE of them (ROLLBACK). Classic example: placing an order =
//   1. insert order   2. insert order item   3. reduce stock
// If step 3 fails, steps 1 and 2 must disappear too. Otherwise we have an
// order for a product we never had in stock.
//
// This is the "A" (Atomicity) in ACID. See docs/CONCEPTS.md.

const { sequelize, Customer, Product, Order, OrderItem } = require('../src/models');
const { heading, runLesson } = require('./helper');

// Places an order using a MANAGED transaction:
//   sequelize.transaction(async (t) => { ... })
//   - callback finishes normally -> Sequelize runs COMMIT
//   - callback throws an error   -> Sequelize runs ROLLBACK and re-throws
// Rule: pass { transaction: t } to EVERY query inside, or that query runs
// outside the transaction!
async function placeOrder(customerId, productId, quantity) {
  return sequelize.transaction(async (t) => {
    // lock: UPDATE -> SELECT ... FOR UPDATE. Other transactions that want this
    // same product row must wait until we COMMIT/ROLLBACK.
    const product = await Product.findByPk(productId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!product) throw new Error(`Product ${productId} not found`);

    const order = await Order.create({ customerId }, { transaction: t });

    await OrderItem.create(
      { orderId: order.id, productId, quantity, unitPrice: product.price },
      { transaction: t }
    );

    console.log(`   (inside transaction) order #${order.id} + item inserted, now reducing stock...`);

    // UPDATE products SET stock = stock - quantity
    // If stock goes below 0, the CHECK constraint (products_stock_not_negative)
    // throws an error -> the whole transaction is rolled back.
    await product.decrement('stock', { by: quantity, transaction: t });

    return order.id;
  });
}

async function countOrders() {
  return Order.count();
}

runLesson(async () => {
  const customer = await Customer.findOne({ where: { email: 'kabir@example.com' } });
  const earbuds = await Product.findOne({ where: { name: 'Bluetooth Earbuds' } });

  heading('1. Successful transaction -> COMMIT');
  let ordersBefore = await countOrders();
  console.log(`Earbuds stock before: ${earbuds.stock}, orders: ${ordersBefore}`);

  if (earbuds.stock >= 1) {
    const orderId = await placeOrder(customer.id, earbuds.id, 1);
    await earbuds.reload();
    console.log(`Order #${orderId} placed. Earbuds stock now: ${earbuds.stock}, orders: ${await countOrders()}`);
  } else {
    console.log('Earbuds are sold out (you ran this lesson a few times). Run "npm run db:reset" to start fresh.');
  }

  heading('2. Failing transaction -> ROLLBACK');
  ordersBefore = await countOrders();
  console.log(`Trying to buy 1000 earbuds (stock is ${earbuds.stock})...`);
  try {
    await placeOrder(customer.id, earbuds.id, 1000);
  } catch (err) {
    console.log(`   Error: ${err.message}`);
  }
  await earbuds.reload();
  console.log(`Orders before: ${ordersBefore}, after: ${await countOrders()}  <- same, the inserted order was rolled back`);
  console.log(`Earbuds stock still: ${earbuds.stock}`);

  heading('3. UNMANAGED transaction - you call commit / rollback yourself');
  // Useful when the flow is complex. More code = more chances to forget
  // rollback(), so prefer the managed style when you can.
  const t = await sequelize.transaction();
  try {
    const bottle = await Product.findOne({ where: { name: 'Steel Water Bottle' }, transaction: t });
    await bottle.increment('stock', { by: 10, transaction: t });
    await bottle.reload({ transaction: t });
    console.log(`Inside transaction, bottle stock = ${bottle.stock}`);

    // We change our mind -> undo everything
    await t.rollback();
    await bottle.reload();
    console.log(`After rollback, bottle stock = ${bottle.stock}  <- the +10 is gone`);
  } catch (err) {
    await t.rollback();
    throw err;
  }

  heading('4. Why the row lock matters (two buyers at the same time)');
  // Both transactions start "at the same time". Because of FOR UPDATE the second
  // one waits for the first to finish, then reads the NEW stock value.
  // Without the lock, when only 1 item is left, both could read stock = 1
  // and both could sell it.
  const mouse = await Product.findOne({ where: { name: 'Wireless Mouse' } });
  const stockBefore = mouse.stock;
  const results = await Promise.allSettled([
    placeOrder(customer.id, mouse.id, 2),
    placeOrder(customer.id, mouse.id, 2),
  ]);
  await mouse.reload();
  console.log('Results:', results.map((r) => r.status).join(', '));
  console.log(`Mouse stock: ${stockBefore} -> ${mouse.stock} (exactly 4 less, no lost update)`);

  console.log('\nNote: isolation levels (READ COMMITTED is the PostgreSQL default,');
  console.log('REPEATABLE READ, SERIALIZABLE) are explained in docs/CONCEPTS.md');
});
