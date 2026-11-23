// LESSON 3: Associations (relationships) and JOINs
// Run: npm run lesson:3
//
// The relationships are defined in src/models/index.js - open it side by side.
// "include" in Sequelize = JOIN in SQL.

const { Customer, CustomerProfile, Category, Product, Order, OrderItem } = require('../src/models');
const { heading, show, showNested, runLesson } = require('./helper');

runLesson(async () => {
  heading('1. ONE-TO-ONE: customer + profile (hasOne / belongsTo)');
  // By default include = LEFT OUTER JOIN -> customers WITHOUT a profile are still returned
  const customers = await Customer.findAll({
    attributes: ['id', 'name'],
    include: [{ model: CustomerProfile, as: 'profile', attributes: ['phone'] }],
    order: [['id', 'ASC']],
  });
  for (const c of customers) {
    console.log(`${c.name.padEnd(15)} phone: ${c.profile ? c.profile.phone : '(no profile)'}`);
  }

  heading('2. ONE-TO-MANY: category -> products (hasMany)');
  const categories = await Category.findAll({
    include: [{ model: Product, as: 'products', attributes: ['name', 'price'] }],
    order: [
      ['name', 'ASC'],
      [{ model: Product, as: 'products' }, 'name', 'ASC'], // sort the included rows too
    ],
  });
  for (const category of categories) {
    console.log(`\n${category.name} (${category.products.length} products)`);
    for (const p of category.products) {
      console.log(`   - ${p.name} : Rs. ${p.price}`);
    }
  }

  heading('3. BELONGS-TO: product -> its category');
  const keyboard = await Product.findOne({
    where: { name: 'Mechanical Keyboard' },
    include: [{ model: Category, as: 'category', attributes: ['name'] }],
  });
  console.log(`${keyboard.name} is in category "${keyboard.category.name}"`);

  heading('4. LAZY loading with getter methods');
  // Associations give every instance helper methods: getOrders(), getProfile(), ...
  // This runs a SECOND query only when you call it.
  const aarav = await Customer.findOne({ where: { email: 'aarav@example.com' } });
  const aaravOrders = await aarav.getOrders({ attributes: ['id', 'status', 'totalAmount'] });
  console.log(`${aarav.name} has ${aaravOrders.length} orders:`);
  show(aaravOrders);
  // Careful: calling a getter inside a loop = one query per row ("N+1 problem").
  // When you need related data for many rows, use include (one JOIN query) instead.

  heading('5. MANY-TO-MANY: order <-> products (belongsToMany through order_items)');
  const order = await Order.findOne({
    where: { id: aaravOrders[0].id },
    attributes: ['id', 'status', 'totalAmount'],
    include: [
      {
        model: Product,
        as: 'products',
        attributes: ['name'],
        // columns from the junction table (order_items) we want to see
        through: { attributes: ['quantity', 'unitPrice'] },
      },
    ],
  });
  console.log(`Order #${order.id} (${order.status}) total = Rs. ${order.totalAmount}`);
  for (const p of order.products) {
    console.log(`   - ${p.name} x ${p.OrderItem.quantity} @ Rs. ${p.OrderItem.unitPrice}`);
  }

  heading('6. NESTED include: customer -> orders -> items -> product');
  const diya = await Customer.findOne({
    where: { email: 'diya@example.com' },
    attributes: ['name'],
    include: [
      {
        model: Order,
        as: 'orders',
        attributes: ['id', 'status', 'totalAmount'],
        include: [
          {
            model: OrderItem,
            as: 'items',
            attributes: ['quantity'],
            include: [{ model: Product, as: 'product', attributes: ['name'] }],
          },
        ],
      },
    ],
  });
  showNested(diya.toJSON());

  heading('7. required: true  ->  INNER JOIN (only customers who HAVE orders)');
  const buyers = await Customer.findAll({
    attributes: ['name'],
    include: [{ model: Order, as: 'orders', attributes: [], required: true }],
    group: ['Customer.id'],
    order: [['name', 'ASC']],
  });
  console.log(buyers.map((c) => c.name).join(', '));
  console.log('(Rohan has no orders, so he is not in this list)');

  heading('8. Create related rows using the association');
  // We create a customer + profile, then delete it so the lesson can run again.
  const temp = await Customer.create(
    {
      name: 'Temp Customer',
      email: `temp.${Date.now()}@example.com`,
      profile: { phone: '+91 90000 00000', address: 'Somewhere' },
    },
    { include: [{ model: CustomerProfile, as: 'profile' }] }
  );
  console.log(`Created customer #${temp.id} with profile #${temp.profile.id}`);
  await temp.destroy(); // ON DELETE CASCADE removes the profile too
  console.log('Deleted again (profile removed by ON DELETE CASCADE)');
});
