// LESSON 2: CRUD with Sequelize (Create, Read, Update, Delete)
// Run: npm run lesson:2
//
// TIP: set SHOW_SQL=true in .env to see the SQL behind every line below.

const { Customer } = require('../src/models');
const { heading, show, runLesson } = require('./helper');

runLesson(async () => {
  // Date.now() makes the email unique, so you can run this lesson many times
  const email = `test.${Date.now()}@example.com`;

  heading('1. CREATE  ->  INSERT INTO customers ...');
  const customer = await Customer.create({
    name: 'Test User',
    email,
    city: 'Vadodara',
  });
  // id, createdAt, updatedAt were filled by the database / Sequelize
  show(customer);

  heading('2. READ  ->  SELECT ...');

  console.log('\nfindAll - all customers, only some columns, sorted:');
  const allCustomers = await Customer.findAll({
    attributes: ['id', 'name', 'city'],
    order: [['id', 'ASC']],
  });
  show(allCustomers);

  console.log('\nfindByPk - find by primary key:');
  const byId = await Customer.findByPk(customer.id);
  console.log(byId ? byId.name : 'not found');

  console.log('\nfindOne - first row that matches:');
  const byEmail = await Customer.findOne({ where: { email } });
  console.log(byEmail ? `${byEmail.name} (${byEmail.email})` : 'not found');

  console.log('\nfindByPk with an id that does not exist returns null (no error):');
  console.log(await Customer.findByPk(999999));

  heading('3. UPDATE  ->  UPDATE customers SET ...');

  // Way 1: change the object, then save() - updates only the changed columns
  customer.city = 'Gandhinagar';
  await customer.save();
  console.log('After save():', customer.city);

  // Way 2: update many rows with one query, returns [numberOfRowsChanged]
  const [changedRows] = await Customer.update({ name: 'Test User (edited)' }, { where: { email } });
  console.log('Rows changed by Customer.update():', changedRows);

  // reload() reads the row again from the database
  await customer.reload();
  console.log('After reload():', customer.name);

  heading('4. VALIDATION and CONSTRAINT errors');

  try {
    // Sequelize validation (isEmail) - fails in Node.js, no query is sent
    await Customer.create({ name: 'Bad Email', email: 'not-an-email' });
  } catch (err) {
    console.log(`${err.name}:`, err.errors.map((e) => e.message).join(', '));
  }

  try {
    // UNIQUE constraint - the query IS sent, PostgreSQL rejects it
    await Customer.create({ name: 'Duplicate', email });
  } catch (err) {
    console.log(`${err.name}:`, err.errors.map((e) => e.message).join(', '));
  }

  heading('5. DELETE  ->  DELETE FROM customers ...');
  await customer.destroy();
  // Other way: await Customer.destroy({ where: { email } });

  const stillThere = await Customer.findOne({ where: { email } });
  console.log('Found after delete?', stillThere !== null);
});
