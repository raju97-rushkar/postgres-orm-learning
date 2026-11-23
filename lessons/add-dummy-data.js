// Inserts a few dummy rows using Sequelize, so you can see them in pgAdmin.
// Run: npm run dummy   (safe to run many times - email is made unique each run)

const { sequelize, Customer, Category, Product, Order, OrderItem } = require('../src/models');

async function main() {
  const stamp = Date.now();

  await sequelize.transaction(async (t) => {
    const customer = await Customer.create(
      { name: 'Dummy Customer', email: `dummy${stamp}@test.com`, city: 'Rajkot' },
      { transaction: t }
    );

    const category = await Category.findOne({ transaction: t });
    const product = await Product.create(
      { categoryId: category.id, name: `Dummy Product ${stamp}`, price: 499.0, stock: 25 },
      { transaction: t }
    );

    const order = await Order.create(
      { customerId: customer.id, status: 'paid', totalAmount: 998.0 },
      { transaction: t }
    );
    await OrderItem.create(
      { orderId: order.id, productId: product.id, quantity: 2, unitPrice: product.price },
      { transaction: t }
    );

    console.log('Inserted:');
    console.log(`  customers   id=${customer.id}  email=${customer.email}`);
    console.log(`  products    id=${product.id}   name=${product.name}`);
    console.log(`  orders      id=${order.id}     customer_id=${customer.id}`);
    console.log(`  order_items order_id=${order.id} product_id=${product.id} qty=2`);
  });

  await sequelize.close();
}

main().catch(async (err) => {
  console.error('Failed:', err.message);
  await sequelize.close();
  process.exit(1);
});
