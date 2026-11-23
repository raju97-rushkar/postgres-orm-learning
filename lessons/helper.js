// Small helpers shared by all lessons, so each lesson file stays focused
// on the topic itself.
const { sequelize } = require('../src/models');

function heading(text) {
  console.log('\n' + '='.repeat(70));
  console.log(text);
  console.log('='.repeat(70));
}

// Sequelize instances have extra stuff on them. toJSON() gives a plain object.
function show(data) {
  if (Array.isArray(data)) {
    const rows = data.map((row) => (row && row.toJSON ? row.toJSON() : row));
    console.table(rows);
  } else if (data && data.toJSON) {
    console.log(data.toJSON());
  } else {
    console.log(data);
  }
}

// For nested results (includes), console.table is not readable -> pretty JSON
function showNested(data) {
  console.log(JSON.stringify(data, null, 2));
}

// Runs the lesson, prints errors nicely, and always closes the DB connection.
// (If we don't close it, Node.js keeps waiting and the script never exits.)
async function runLesson(lessonFn) {
  try {
    await lessonFn();
  } catch (err) {
    console.error('\nLesson failed:', err.message);
    console.error('Did you run "npm run setup" first?');
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

module.exports = { heading, show, showNested, runLesson };
