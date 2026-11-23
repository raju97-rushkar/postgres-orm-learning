// reads the .env file into process.env (quiet = don't print a log line)
require('dotenv').config({ quiet: true });

// Used by BOTH sequelize-cli (migrations, seeders) and our own code (src/db.js).
// sequelize-cli picks the block that matches NODE_ENV (default: "development").
const common = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 5433,
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  dialect: 'postgres',
  logging: false,
};

module.exports = {
  development: {
    ...common,
    database: process.env.DB_NAME || 'shop_learning',
  },
  test: {
    ...common,
    database: `${process.env.DB_NAME || 'shop_learning'}_test`,
  },
};
