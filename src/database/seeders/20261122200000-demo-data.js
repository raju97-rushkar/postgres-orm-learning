'use strict';

// SEEDER = fills the tables with sample data so we have something to query.
//   npm run db:seed        -> insert
//   npm run db:seed:undo   -> remove
//
// Migrations = STRUCTURE (tables, columns). Seeders = DATA.

const categories = ['Electronics', 'Books', 'Clothing', 'Home & Kitchen'];

const products = [
  { category: 'Electronics', name: 'Wireless Mouse', price: 599.0, stock: 120 },
  { category: 'Electronics', name: 'Mechanical Keyboard', price: 2499.0, stock: 40 },
  { category: 'Electronics', name: 'USB-C Charger 65W', price: 1299.0, stock: 75 },
  { category: 'Electronics', name: 'Bluetooth Earbuds', price: 1899.0, stock: 3 }, // low stock on purpose
  { category: 'Books', name: 'Clean Code', price: 450.0, stock: 60 },
  { category: 'Books', name: 'The Pragmatic Programmer', price: 520.0, stock: 35 },
  { category: 'Books', name: 'Learning SQL', price: 399.0, stock: 80 },
  { category: 'Clothing', name: 'Cotton T-Shirt', price: 349.0, stock: 200 },
  { category: 'Clothing', name: 'Denim Jacket', price: 1799.0, stock: 25 },
  { category: 'Home & Kitchen', name: 'Steel Water Bottle', price: 299.0, stock: 150 },
  { category: 'Home & Kitchen', name: 'Non-stick Pan', price: 899.0, stock: 0, isActive: false }, // inactive
];

const customers = [
  { name: 'Aarav Patel', email: 'aarav@example.com', city: 'Ahmedabad' },
  { name: 'Diya Shah', email: 'diya@example.com', city: 'Surat' },
  { name: 'Kabir Mehta', email: 'kabir@example.com', city: 'Rajkot' },
  { name: 'Meera Joshi', email: 'meera@example.com', city: 'Mumbai' },
  { name: 'Rohan Desai', email: 'rohan@example.com', city: null }, // no city, no profile, no orders
];

// Only some customers have a profile -> good for LEFT JOIN practice
const profiles = [
  { email: 'aarav@example.com', phone: '+91 98250 11111', address: 'Navrangpura, Ahmedabad' },
  { email: 'diya@example.com', phone: '+91 98250 22222', address: 'Adajan, Surat' },
  { email: 'meera@example.com', phone: '+91 98200 33333', address: 'Andheri, Mumbai' },
];

const orders = [
  { email: 'aarav@example.com', status: 'paid', items: [['Wireless Mouse', 1], ['Clean Code', 2]] },
  { email: 'aarav@example.com', status: 'paid', items: [['Mechanical Keyboard', 1]] },
  { email: 'diya@example.com', status: 'paid', items: [['Cotton T-Shirt', 3], ['Steel Water Bottle', 1]] },
  { email: 'diya@example.com', status: 'pending', items: [['Denim Jacket', 1]] },
  { email: 'kabir@example.com', status: 'cancelled', items: [['USB-C Charger 65W', 1]] },
  { email: 'meera@example.com', status: 'paid', items: [['Learning SQL', 1], ['The Pragmatic Programmer', 1]] },
];

module.exports = {
  async up(queryInterface) {
    // returning: true -> PostgreSQL sends back the inserted rows (with their new ids)
    const insertedCategories = await queryInterface.bulkInsert(
      'categories',
      categories.map((name) => ({ name })),
      { returning: true }
    );
    const categoryIdByName = Object.fromEntries(insertedCategories.map((c) => [c.name, c.id]));

    const insertedProducts = await queryInterface.bulkInsert(
      'products',
      products.map((p) => ({
        category_id: categoryIdByName[p.category],
        name: p.name,
        price: p.price,
        stock: p.stock,
        is_active: p.isActive ?? true,
      })),
      { returning: true }
    );
    const productByName = Object.fromEntries(insertedProducts.map((p) => [p.name, p]));

    const insertedCustomers = await queryInterface.bulkInsert('customers', customers, { returning: true });
    const customerIdByEmail = Object.fromEntries(insertedCustomers.map((c) => [c.email, c.id]));

    await queryInterface.bulkInsert(
      'customer_profiles',
      profiles.map((p) => ({
        customer_id: customerIdByEmail[p.email],
        phone: p.phone,
        address: p.address,
      }))
    );

    // Orders one by one, because each needs its own id for the items.
    // We don't pass total_amount: the trigger calculates it from the items.
    // (We also don't reduce stock here - this is just "old" history data.)
    for (const order of orders) {
      const [insertedOrder] = await queryInterface.bulkInsert(
        'orders',
        [{ customer_id: customerIdByEmail[order.email], status: order.status }],
        { returning: true }
      );

      await queryInterface.bulkInsert(
        'order_items',
        order.items.map(([productName, quantity]) => ({
          order_id: insertedOrder.id,
          product_id: productByName[productName].id,
          quantity,
          unit_price: productByName[productName].price,
        }))
      );
    }
  },

  async down(queryInterface) {
    // TRUNCATE empties the tables fast.
    // RESTART IDENTITY -> ids start again from 1
    // CASCADE          -> also empty tables that point to these ones
    await queryInterface.sequelize.query(`
      TRUNCATE TABLE
        product_price_history, order_items, orders,
        customer_profiles, customers, products, categories
      RESTART IDENTITY CASCADE;
    `);
  },
};
