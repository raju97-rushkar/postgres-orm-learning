// LESSON 7: Stored Procedures
// Run: npm run lesson:7
//
// The procedures were created by the migration
//   src/database/migrations/20261122101100-create-procedures.js
//
// Compare this lesson with lesson 5: there we placed an order with 3-4 queries
// from Node.js. Here the database does the whole job in ONE call.

const { QueryTypes } = require('sequelize');
const { sequelize, Customer, Product, Order } = require('../src/models');
const { heading, show, runLesson } = require('./helper');

// Small wrapper so the lesson reads nicely.
// The 4th argument (NULL) is the INOUT parameter - the procedure fills it
// with the new order id, and CALL returns it as a row: { p_order_id: 12 }
async function callPlaceOrder(customerId, productId, quantity) {
  const [row] = await sequelize.query('CALL place_order(:customerId, :productId, :quantity, NULL)', {
    replacements: { customerId, productId, quantity },
    type: QueryTypes.SELECT,
  });
  return row.p_order_id;
}

// PostgreSQL's error message is in err.original (err.message has it too)
function dbErrorMessage(err) {
  return err.original ? err.original.message : err.message;
}

runLesson(async () => {
  const meera = await Customer.findOne({ where: { email: 'meera@example.com' } });
  const book = await Product.findOne({ where: { name: 'Clean Code' } });

  heading('1. CALL place_order(...) - success');
  console.log(`"${book.name}" stock before: ${book.stock}`);

  const orderId = await callPlaceOrder(meera.id, book.id, 2);
  await book.reload();

  const order = await Order.findByPk(orderId, { attributes: ['id', 'status', 'totalAmount'] });
  console.log(`New order id returned by the procedure: ${orderId}`);
  show(order);
  console.log(`"${book.name}" stock after: ${book.stock}  (reduced by the procedure)`);
  console.log('totalAmount was filled by the trigger on order_items');

  heading('2. Errors raised by the procedure (RAISE EXCEPTION)');
  const badCalls = [
    { label: 'too many items', customerId: meera.id, productId: book.id, quantity: 100000 },
    { label: 'quantity 0', customerId: meera.id, productId: book.id, quantity: 0 },
    { label: 'unknown product', customerId: meera.id, productId: 999999, quantity: 1 },
    { label: 'unknown customer (FK error)', customerId: 999999, productId: book.id, quantity: 1 },
  ];
  for (const call of badCalls) {
    try {
      await callPlaceOrder(call.customerId, call.productId, call.quantity);
    } catch (err) {
      console.log(`${call.label.padEnd(28)} -> ${dbErrorMessage(err)}`);
    }
  }
  console.log('\nIn every failed call nothing was saved - one CALL runs as one transaction.');

  heading('3. CALL cancel_order(...) - puts the stock back');
  await sequelize.query('CALL cancel_order(:orderId)', { replacements: { orderId } });
  await book.reload();
  await order.reload();
  console.log(`Order #${order.id} status: ${order.status}`);
  console.log(`"${book.name}" stock back to: ${book.stock}`);

  console.log('\nCancel the same order again:');
  try {
    await sequelize.query('CALL cancel_order(:orderId)', { replacements: { orderId } });
  } catch (err) {
    console.log(`   -> ${dbErrorMessage(err)}`);
  }

  heading('4. A procedure call inside a Sequelize transaction');
  // Two orders that must succeed together. The second one fails, so the first
  // one is rolled back as well.
  const ordersBefore = await Order.count();
  try {
    await sequelize.transaction(async (t) => {
      await sequelize.query('CALL place_order(:c, :p, 1, NULL)', {
        replacements: { c: meera.id, p: book.id },
        transaction: t,
      });
      console.log('   first CALL ok...');
      await sequelize.query('CALL place_order(:c, :p, 100000, NULL)', {
        replacements: { c: meera.id, p: book.id },
        transaction: t,
      });
    });
  } catch (err) {
    console.log(`   second CALL failed: ${dbErrorMessage(err)}`);
  }
  console.log(`Orders before: ${ordersBefore}, after: ${await Order.count()}  <- first order rolled back too`);
});
