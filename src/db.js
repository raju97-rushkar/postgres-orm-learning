const { Sequelize } = require('sequelize');
const allConfigs = require('./config/config');

const env = process.env.NODE_ENV || 'development';
const config = allConfigs[env];

// One Sequelize instance for the whole project.
// Internally it keeps a "pool" of connections and reuses them,
// so we don't open a new connection for every query.
const sequelize = new Sequelize(config.database, config.username, config.password, {
  host: config.host,
  port: config.port,
  dialect: 'postgres',

  // SHOW_SQL=true in .env -> you will see the real SQL for every ORM call
  logging: process.env.SHOW_SQL === 'true' ? (sql) => console.log(`  [SQL] ${sql}`) : false,

  pool: {
    max: 5, // max connections open at the same time
    min: 0,
    idle: 10000, // close a connection after 10s of no use
  },

  define: {
    // JS side: camelCase (createdAt, customerId)
    // DB side: snake_case (created_at, customer_id)
    underscored: true,
  },
});

module.exports = sequelize;
