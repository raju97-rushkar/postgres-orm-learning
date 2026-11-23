# PostgreSQL + Sequelize ORM - Learning Project

A small **online shop** database (customers, products, orders) built to learn PostgreSQL and Sequelize step by step. No web server, no frontend - just the database and small runnable lessons, so you can focus on one topic at a time.

**What you'll learn**

| Topic | Where |
|---|---|
| PostgreSQL fundamentals, architecture, relational concepts | [docs/CONCEPTS.md](docs/CONCEPTS.md), lesson 1 |
| Sequelize setup, models, CRUD | [src/models/](src/models/), lesson 2 |
| Associations / relationships (1-1, 1-many, many-many) | [src/models/index.js](src/models/index.js), lesson 3 |
| Query operations (filters, pagination, GROUP BY, raw SQL) | lesson 4, [sql/02-joins-and-grouping.sql](sql/02-joins-and-grouping.sql) |
| Transactions & locking | lesson 5, [sql/03-transactions.sql](sql/03-transactions.sql) |
| PostgreSQL functions | lesson 6, [migration](src/database/migrations/20261122101000-create-functions.js) |
| Stored procedures | lesson 7, [migration](src/database/migrations/20261122101100-create-procedures.js) |
| Triggers | lesson 8, [migration](src/database/migrations/20261122101200-create-triggers.js) |
| Migrations & schema versioning | [src/database/migrations/](src/database/migrations/) |
| Indexing & optimization (EXPLAIN ANALYZE) | lesson 9, [sql/04-indexes-and-explain.sql](sql/04-indexes-and-explain.sql) |
| Advanced joins, subqueries, CTEs (recursive), LATERAL | lesson 10 |
| Performance: choosing the right index, N+1, pagination | lesson 11 |
| Advanced transactions: savepoints, isolation, deadlocks | lesson 12 |
| Constraints, validations, ON DELETE rules | lesson 13, [migration](src/database/migrations/20261123100000-add-loyalty-points-to-customers.js) |
| Migration practice (run / roll back / write) | [docs/MIGRATIONS.md](docs/MIGRATIONS.md) |

---

## 1. Setup

You need **Node.js 20+** and **PostgreSQL 14+** running.

```bash
npm install
copy .env.example .env      # Mac/Linux: cp .env.example .env
```

Open `.env` and set your PostgreSQL host, port, user and password. Then:

```bash
npm run setup
```

`setup` does three things:
1. `db:create` - creates the database `shop_learning`
2. `db:migrate` - runs all migrations (tables, indexes, functions, procedures, triggers)
3. `db:seed` - inserts sample data

**pgAdmin:** connect to your server and open **Databases -> shop_learning -> Schemas -> public**. You'll see Tables, Functions, Procedures and Trigger Functions there.

## 2. The database

```
 customers 1───1 customer_profiles
     │1
     │
     │*
  orders 1───* order_items *───1 products *───1 categories
                                    │1
                                    │*
                          product_price_history   (filled by a trigger)
```

| Table | What it stores |
|---|---|
| `customers` | people who buy |
| `customer_profiles` | optional phone + address (one-to-one with customers) |
| `categories` | Electronics, Books, ... |
| `products` | name, price, stock. `CHECK (stock >= 0)` |
| `orders` | one purchase. `status`: pending / paid / cancelled. `total_amount` is kept up to date by a trigger |
| `order_items` | products inside an order (junction table: orders <-> products) |
| `product_price_history` | every price change, written by a trigger |

**Inside the database (created by migrations):**

| Name | Kind | What it does |
|---|---|---|
| `get_order_total(order_id)` | function | sum of an order's items |
| `get_customer_total_spent(customer_id)` | function | total of a customer's paid orders |
| `get_products_by_category(name)` | function (returns a table) | active products of a category |
| `place_order(customer, product, qty, INOUT order_id)` | procedure | checks + locks stock, creates order + item, reduces stock |
| `cancel_order(order_id)` | procedure | cancels and gives stock back |
| `trg_*_set_updated_at` | trigger | sets `updated_at` on every UPDATE |
| `trg_products_price_history` | trigger | logs price changes |
| `trg_order_items_refresh_total` | trigger | recalculates `orders.total_amount` |

## 3. Lessons

Run them **in order**. Read the lesson file first, then run it and compare the output.

```bash
npm run lesson:1   # connection, database structure, information_schema
npm run lesson:2   # CRUD: create, findAll, findOne, update, destroy, validation
npm run lesson:3   # associations: hasOne, hasMany, belongsTo, belongsToMany, include
npm run lesson:4   # Op operators, pagination, aggregates, GROUP BY / HAVING, raw SQL, CTE
npm run lesson:5   # transactions: commit, rollback, row locks
npm run lesson:6   # PostgreSQL functions
npm run lesson:7   # stored procedures
npm run lesson:8   # triggers
npm run lesson:9   # indexes + EXPLAIN ANALYZE on 200,000 rows
npm run lesson:10  # all JOIN types, subqueries, multiple + recursive CTEs, LATERAL
npm run lesson:11  # performance: composite / partial / expression / covering index, N+1, keyset pagination
npm run lesson:12  # savepoints, isolation levels, retry on 40001, deadlocks, NOWAIT / SKIP LOCKED, afterCommit
npm run lesson:13  # constraints vs validations, Sequelize error classes, ON DELETE CASCADE / RESTRICT
```

Lessons 10-13 roll back their changes, so you can run them as often as you like.
Migration practice (run / undo / write your own): [docs/MIGRATIONS.md](docs/MIGRATIONS.md).

**Tip:** set `SHOW_SQL=true` in `.env` and run a lesson again - you'll see the real SQL behind every Sequelize call. This is the best way to understand what the ORM does.

The SQL files in [sql/](sql/) are for practicing directly in pgAdmin's Query Tool.

## 4. Migration commands

```bash
npm run db:migrate:status     # which migrations ran
npm run db:migrate:undo       # undo the last one
npm run db:migrate            # run the pending ones again
npm run db:reset              # undo all + migrate + seed  (fresh start)
```

Try this to understand schema versioning:

```bash
npm run db:migrate:undo       # undoes create-triggers
npm run db:migrate:status     # create-triggers is now "down"
npm run db:migrate            # applies it again
```

Create your own migration:

```bash
npx sequelize-cli migration:generate --name add-discount-to-products
```

## 5. Project structure

```
postgres-orm-learning/
├── .sequelizerc               tells sequelize-cli where our folders are
├── .env.example               DB connection settings
├── src/
│   ├── config/config.js       DB config (used by the CLI and by our code)
│   ├── db.js                  the Sequelize instance (connection pool)
│   ├── models/                one file per table + index.js with all associations
│   └── database/
│       ├── migrations/        schema changes, in order (tables -> indexes -> functions -> procedures -> triggers)
│       └── seeders/           sample data
├── lessons/                   runnable lessons 01 - 09
├── sql/                       plain SQL practice files for pgAdmin
└── docs/CONCEPTS.md           theory notes for every topic
```

## 6. Practice tasks (try on your own)

1. Add a `discount_percent` column to `products` with a new migration (default 0, CHECK between 0 and 100). Add it to the model.
2. Write a function `get_category_stock_value(category_name)` that returns `SUM(price * stock)`.
3. Write a procedure `pay_order(order_id)` that changes `pending` -> `paid` and raises an error for any other status.
4. Write a trigger that stops deleting a `paid` order (hint at the end of [sql/05-functions-procedures-triggers.sql](sql/05-functions-procedures-triggers.sql)).
5. In lesson 4, find the 2 customers with the most orders using Sequelize (`group`, `order`, `limit`).
6. Run `EXPLAIN ANALYZE` on one of your queries, add an index, and compare.

## 7. Common errors

| Error | Fix |
|---|---|
| `password authentication failed` | check `DB_USER` / `DB_PASSWORD` in `.env` |
| `connect ECONNREFUSED` | PostgreSQL is not running, or wrong `DB_PORT` |
| `database "shop_learning" does not exist` | run `npm run db:create` |
| `relation "products" does not exist` | run `npm run db:migrate` |
| `type "enum_orders_status" already exists` | a migration's `down()` didn't drop the ENUM; run `DROP TYPE enum_orders_status;` |
| Earbuds "sold out" in lesson 5 | you ran it many times; `npm run db:reset` |
