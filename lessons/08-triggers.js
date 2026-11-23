// LESSON 8: Triggers - automatic actions inside the database
// Run: npm run lesson:8
//
// The triggers were created by the migration
//   src/database/migrations/20261122101200-create-triggers.js

const { QueryTypes } = require('sequelize');
const { sequelize, Customer, Product, ProductPriceHistory, Order, OrderItem } = require('../src/models');
const { heading, show, runLesson } = require('./helper');

runLesson(async () => {
  heading('1. Which triggers exist?');
  const triggers = await sequelize.query(
    `SELECT trigger_name, event_object_table AS "table", action_timing AS timing,
            string_agg(event_manipulation, ' OR ') AS events
     FROM information_schema.triggers
     WHERE trigger_schema = 'public'
     GROUP BY trigger_name, event_object_table, action_timing
     ORDER BY "table", trigger_name`,
    { type: QueryTypes.SELECT }
  );
  show(triggers);

  heading('2. Price history trigger (AFTER UPDATE OF price)');
  const jacket = await Product.findOne({ where: { name: 'Denim Jacket' } });
  const originalPrice = jacket.price;

  // We only update the price. We never touch product_price_history from JS...
  await jacket.update({ price: 1599 });
  console.log(`Price changed ${originalPrice} -> ${jacket.price}`);

  // ...but the trigger wrote a row there for us
  const history = await ProductPriceHistory.findAll({
    where: { productId: jacket.id },
    attributes: ['oldPrice', 'newPrice', 'changedAt'],
    order: [['id', 'DESC']],
    limit: 3,
  });
  show(history);

  // Changing only the stock does NOT create history (WHEN OLD.price IS DISTINCT FROM NEW.price)
  const countBefore = await ProductPriceHistory.count({ where: { productId: jacket.id } });
  await jacket.update({ stock: jacket.stock + 1 });
  await jacket.update({ stock: jacket.stock - 1 });
  const countAfter = await ProductPriceHistory.count({ where: { productId: jacket.id } });
  console.log(`History rows after a stock-only change: ${countBefore} -> ${countAfter} (no new row)`);

  // Put the old price back (this creates one more history row - that's correct!)
  await jacket.update({ price: originalPrice });

  heading('3. Order total trigger (AFTER INSERT / UPDATE / DELETE on order_items)');
  const rohan = await Customer.findOne({ where: { email: 'rohan@example.com' } });
  const tshirt = await Product.findOne({ where: { name: 'Cotton T-Shirt' } });
  const bottle = await Product.findOne({ where: { name: 'Steel Water Bottle' } });

  // We do this inside a transaction and roll back at the end, so this demo
  // order doesn't stay in the database.
  const t = await sequelize.transaction();
  try {
    const order = await Order.create({ customerId: rohan.id }, { transaction: t });
    const printTotal = async (step) => {
      await order.reload({ transaction: t });
      console.log(`${step.padEnd(32)} total_amount = Rs. ${order.totalAmount}`);
    };

    await printTotal('New empty order');

    const item = await OrderItem.create(
      { orderId: order.id, productId: tshirt.id, quantity: 2, unitPrice: tshirt.price },
      { transaction: t }
    );
    await printTotal(`+ 2 x T-Shirt (${tshirt.price})`);

    await OrderItem.create(
      { orderId: order.id, productId: bottle.id, quantity: 1, unitPrice: bottle.price },
      { transaction: t }
    );
    await printTotal(`+ 1 x Bottle (${bottle.price})`);

    await item.update({ quantity: 5 }, { transaction: t });
    await printTotal('T-Shirt quantity 2 -> 5');

    await item.destroy({ transaction: t });
    await printTotal('T-Shirt removed');

    console.log('We never calculated a total in JS - the trigger did it every time.');
  } finally {
    await t.rollback();
  }

  heading('4. updated_at trigger works even for raw SQL');
  // Raw SQL bypasses Sequelize, so Sequelize can't set updated_at here.
  // The BEFORE UPDATE trigger does it.
  const before = await Product.findOne({ where: { name: 'Learning SQL' }, attributes: ['updatedAt'] });
  await sequelize.query(`UPDATE products SET stock = stock WHERE name = 'Learning SQL'`);
  const after = await Product.findOne({ where: { name: 'Learning SQL' }, attributes: ['updatedAt'] });
  console.log('updated_at before:', before.updatedAt.toISOString());
  console.log('updated_at after :', after.updatedAt.toISOString());

  heading('5. Triggers protect data from ANY source');
  console.log('Try this in pgAdmin (Query Tool) and then check product_price_history:');
  console.log("   UPDATE products SET price = price + 1 WHERE name = 'Clean Code';");
});
