// LESSON 4: Query operations - filters, sorting, pagination, grouping, raw SQL
// Run: npm run lesson:4

const { Op, QueryTypes } = require('sequelize');
const { sequelize, Customer, Category, Product, Order } = require('../src/models');
const { heading, show, runLesson } = require('./helper');

runLesson(async () => {
  heading('1. WHERE with operators (Op)');

  console.log('\nprice > 1000  (Op.gt)');
  show(await Product.findAll({ attributes: ['name', 'price'], where: { price: { [Op.gt]: 1000 } } }));

  console.log('\nprice BETWEEN 300 AND 600');
  show(
    await Product.findAll({
      attributes: ['name', 'price'],
      where: { price: { [Op.between]: [300, 600] } },
    })
  );

  console.log('\nname contains "bo" - case-insensitive (ILIKE is PostgreSQL only)');
  show(await Product.findAll({ attributes: ['name'], where: { name: { [Op.iLike]: '%bo%' } } }));

  console.log('\ncity IN (Ahmedabad, Surat)');
  show(
    await Customer.findAll({
      attributes: ['name', 'city'],
      where: { city: { [Op.in]: ['Ahmedabad', 'Surat'] } },
    })
  );

  console.log('\ncity IS NULL');
  show(await Customer.findAll({ attributes: ['name'], where: { city: null } }));

  console.log('\nOR: stock < 10 OR not active');
  show(
    await Product.findAll({
      attributes: ['name', 'stock', 'isActive'],
      where: { [Op.or]: [{ stock: { [Op.lt]: 10 } }, { isActive: false }] },
    })
  );

  heading('2. ORDER BY + LIMIT + OFFSET (pagination)');
  const pageSize = 4;
  for (let page = 1; page <= 3; page++) {
    // findAndCountAll = the rows of this page + the total count (for "page 1 of 3")
    const { count, rows } = await Product.findAndCountAll({
      attributes: ['name', 'price'],
      order: [['price', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    const totalPages = Math.ceil(count / pageSize);
    console.log(`\nPage ${page} of ${totalPages}: ${rows.map((p) => p.name).join(', ')}`);
  }

  heading('3. Aggregates: COUNT, SUM, AVG, MIN, MAX');
  const stats = await Product.findOne({
    attributes: [
      [sequelize.fn('COUNT', sequelize.col('id')), 'totalProducts'],
      [sequelize.fn('SUM', sequelize.col('stock')), 'totalStock'],
      [sequelize.fn('ROUND', sequelize.fn('AVG', sequelize.col('price')), 2), 'avgPrice'],
      [sequelize.fn('MIN', sequelize.col('price')), 'cheapest'],
      [sequelize.fn('MAX', sequelize.col('price')), 'costliest'],
    ],
    raw: true, // give a plain object, we don't need a model instance here
  });
  show(stats);

  heading('4. GROUP BY: number of products per category');
  const perCategory = await Category.findAll({
    attributes: ['name', [sequelize.fn('COUNT', sequelize.col('products.id')), 'productCount']],
    include: [{ model: Product, as: 'products', attributes: [] }],
    group: ['Category.id'],
    order: [['name', 'ASC']],
    raw: true,
  });
  show(perCategory);

  heading('5. GROUP BY + HAVING: customers who spent more than Rs. 1000 (paid orders)');
  const bigSpenders = await Order.findAll({
    attributes: [
      'customerId',
      [sequelize.fn('COUNT', sequelize.col('Order.id')), 'orders'],
      [sequelize.fn('SUM', sequelize.col('total_amount')), 'spent'],
    ],
    include: [{ model: Customer, as: 'customer', attributes: ['name'] }],
    where: { status: 'paid' },
    group: ['Order.customer_id', 'customer.id'],
    having: sequelize.where(sequelize.fn('SUM', sequelize.col('total_amount')), Op.gt, 1000),
    order: [[sequelize.literal('spent'), 'DESC']],
  });
  for (const row of bigSpenders) {
    console.log(`${row.customer.name.padEnd(15)} orders: ${row.get('orders')}  spent: Rs. ${row.get('spent')}`);
  }

  heading('6. increment / decrement (atomic, no read-then-write)');
  // Runs: UPDATE products SET stock = stock + 5 WHERE ...
  // Safer than "read stock, add 5 in JS, save" when many users update at once.
  const bottle = await Product.findOne({ where: { name: 'Steel Water Bottle' } });
  await bottle.increment('stock', { by: 5 });
  await bottle.reload();
  console.log('After +5:', bottle.stock);
  await bottle.decrement('stock', { by: 5 });
  await bottle.reload();
  console.log('After -5:', bottle.stock);

  heading('7. RAW SQL when the ORM gets in the way');
  // Use replacements (:name) - NEVER put user input directly into the SQL string,
  // that leads to SQL injection.
  const minPrice = 500;
  const rows = await sequelize.query(
    `SELECT c.name AS category, p.name AS product, p.price
     FROM products p
     JOIN categories c ON c.id = p.category_id
     WHERE p.price >= :minPrice AND p.is_active
     ORDER BY p.price DESC
     LIMIT 5`,
    { replacements: { minPrice }, type: QueryTypes.SELECT }
  );
  show(rows);

  heading('8. CTE (WITH ...) + window function - pure SQL power');
  // RANK() OVER (PARTITION BY ...) = ranking inside each group
  // ::int converts the result to integer (SUM and RANK return BIGINT,
  // which the pg driver gives us as a string to avoid losing precision)
  const ranked = await sequelize.query(
    `WITH product_sales AS (
       SELECT p.id, p.name, p.category_id, COALESCE(SUM(oi.quantity), 0)::int AS sold
       FROM products p
       LEFT JOIN order_items oi ON oi.product_id = p.id
       GROUP BY p.id
     )
     SELECT c.name AS category, ps.name AS product, ps.sold,
            (RANK() OVER (PARTITION BY ps.category_id ORDER BY ps.sold DESC))::int AS rank_in_category
     FROM product_sales ps
     JOIN categories c ON c.id = ps.category_id
     ORDER BY c.name, rank_in_category`,
    { type: QueryTypes.SELECT }
  );
  show(ranked);
});
