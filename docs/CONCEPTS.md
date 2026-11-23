# PostgreSQL Concepts - Simple Notes

Short notes for each topic. Read a section, then run the lesson next to it.

---

## 1. What is PostgreSQL?

PostgreSQL ("Postgres") is a **relational database**: data is stored in **tables** (rows and columns), and tables are linked to each other using **keys**. It is free, open source, and used by many companies in production.

**SQL** (Structured Query Language) is the language we use to talk to it: `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CREATE TABLE`...

## 2. Database architecture (how PostgreSQL works inside)

```
 Your Node.js app (Sequelize -> pg driver)
          |  TCP connection (port 5432 / 5433)
          v
 +-------------------- PostgreSQL server ---------------------+
 |  postmaster (main process) - accepts new connections        |
 |     |                                                       |
 |     +-- backend process  (one per connection)               |
 |     +-- backend process                                     |
 |                                                             |
 |  Shared memory:  shared buffers (cache of table pages)      |
 |                  WAL buffers                                |
 |                                                             |
 |  Background:  WAL writer, checkpointer, autovacuum, ...     |
 +-------------------------------------------------------------+
          |
          v
 Disk:  data files (tables, indexes)  +  WAL files (change log)
```

- **One process per connection.** Connections are expensive, so apps use a **connection pool** (Sequelize does this for you - see `pool` in [src/db.js](../src/db.js)).
- **Shared buffers** = memory cache. Reading from memory is much faster than disk.
- **WAL (Write-Ahead Log)**: every change is first written to a log file, then to the table files. If the server crashes, PostgreSQL replays the WAL, so committed data is never lost.
- **MVCC (Multi-Version Concurrency Control)**: an UPDATE doesn't overwrite a row - it creates a new version. Readers see the old version until the writer commits. That's why **readers never block writers** and vice versa.
- **VACUUM / autovacuum** cleans up the old row versions that nobody needs anymore.

### Logical structure

```
Server (cluster)
 └── Database      e.g. shop_learning
      └── Schema   e.g. public  (a "folder" for tables)
           ├── Tables, Views
           ├── Indexes, Sequences
           └── Functions, Procedures, Triggers
```

## 3. Relational database concepts

| Concept | Meaning | In this project |
|---|---|---|
| **Table** | Collection of rows of the same kind | `customers`, `products` |
| **Row / record** | One item | one customer |
| **Column / field** | One property, with a data type | `email VARCHAR(150)` |
| **Primary Key (PK)** | Uniquely identifies a row, never NULL | `id` in every table |
| **Foreign Key (FK)** | A column that points to a PK in another table | `orders.customer_id -> customers.id` |
| **Constraint** | A rule the DB enforces | `NOT NULL`, `UNIQUE`, `CHECK (stock >= 0)` |

### Relationships

| Type | Example | How it is stored |
|---|---|---|
| One-to-One | customer - profile | FK + `UNIQUE` on `customer_profiles.customer_id` |
| One-to-Many | customer - orders | FK `orders.customer_id` |
| Many-to-Many | orders - products | junction table `order_items` with two FKs |

### ON DELETE options for foreign keys

- `CASCADE` - delete the parent, children are deleted too (order -> order_items)
- `RESTRICT` - can't delete the parent while children exist (category -> products)
- `SET NULL` - children keep living, FK becomes NULL

### Normalization (in one minute)

Don't store the same fact in many places. Bad: writing the customer's name and city inside every order row. If they move city, you must update 50 rows. Good: store the customer once in `customers`, and orders just keep `customer_id`.

Exception: `order_items.unit_price` copies the product price **on purpose**. It is a historical fact ("price at the time of buying"), not a duplicate.

### Data types you'll use most

| Type | Use for |
|---|---|
| `INTEGER`, `BIGINT`, `SERIAL` | counts, ids |
| `NUMERIC(10,2)` / `DECIMAL` | **money** (exact). Never `FLOAT` for money |
| `VARCHAR(n)`, `TEXT` | strings |
| `BOOLEAN` | true / false |
| `TIMESTAMPTZ` | date + time **with time zone** (always prefer this) |
| `JSONB` | flexible JSON data, can be indexed |
| `ENUM` | fixed list of values (`pending`, `paid`, ...) |

## 4. ORM and Sequelize

**ORM (Object Relational Mapping)** lets you work with tables as JavaScript objects:

```js
// instead of: SELECT * FROM customers WHERE city = 'Surat';
await Customer.findAll({ where: { city: 'Surat' } });
```

**Pros:** less SQL to write, protection from SQL injection, associations, validation, works the same on many databases.
**Cons:** hides the real SQL (easy to write slow queries), complex reports are easier in raw SQL.

> A good developer knows both. Use the ORM for normal CRUD, raw SQL for complex reports. Turn on `SHOW_SQL=true` while learning to see what the ORM generates.

| Sequelize | SQL |
|---|---|
| `Model.findAll({ where })` | `SELECT ... WHERE` |
| `Model.create()` | `INSERT` |
| `instance.save()` / `Model.update()` | `UPDATE` |
| `instance.destroy()` | `DELETE` |
| `include: [...]` | `LEFT JOIN` (or `INNER JOIN` with `required: true`) |
| `hasOne / hasMany` | the OTHER table has the FK |
| `belongsTo` | THIS table has the FK |
| `belongsToMany({ through })` | many-to-many via junction table |

**N+1 problem:** loading 100 customers and then calling `customer.getOrders()` in a loop = 1 + 100 queries. Use `include` to get everything in 1 query.

## 5. Functions

Code stored in the database, called with `SELECT`.

```sql
CREATE FUNCTION get_order_total(p_order_id INTEGER)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(quantity * unit_price), 0) FROM order_items WHERE order_id = p_order_id;
$$;

SELECT get_order_total(5);
```

- `LANGUAGE sql` - just one query. `LANGUAGE plpgsql` - variables, IF, loops, exceptions.
- Can return one value, or a whole table (`RETURNS TABLE (...)`).
- `IMMUTABLE` (same input -> same output, never reads tables), `STABLE` (reads but doesn't change data), `VOLATILE` (default, may change data).
- **Use cases:** reusable calculations, reports, validation logic, trigger functions.

## 6. Stored Procedures

Code stored in the database, called with `CALL`. (PostgreSQL 11+)

| | Function | Procedure |
|---|---|---|
| Called with | `SELECT fn()` | `CALL proc()` |
| Returns | a value or table (required) | nothing, or values via `INOUT` params |
| Use inside a query | yes | no |
| `COMMIT` / `ROLLBACK` inside | no | yes |
| Typical use | calculations | a "job": insert/update many tables |

**Use cases:** place an order (check stock + insert order + insert items + reduce stock), month-end jobs, archiving old data.

**When NOT to:** business logic that changes often, or that needs to call APIs - keep that in Node.js where it's easier to test.

## 7. Triggers

"When X happens on a table, automatically run Y."

```sql
CREATE TRIGGER trg_products_price_history
AFTER UPDATE OF price ON products
FOR EACH ROW
WHEN (OLD.price IS DISTINCT FROM NEW.price)
EXECUTE FUNCTION log_product_price_change();
```

- `BEFORE` - can modify the row before it is saved (`NEW.updated_at := NOW()`), or stop it with `RAISE EXCEPTION`.
- `AFTER` - row is already saved; good for audit logs and updating other tables.
- `FOR EACH ROW` vs `FOR EACH STATEMENT` - once per row, or once per SQL statement.
- `NEW` / `OLD` / `TG_OP` - the new row, the old row, and which operation.

**Use cases:** audit logs, `updated_at`, keeping totals in sync, blocking invalid changes.
**Careful:** triggers are invisible from the app code, can slow down bulk inserts, and trigger chains are hard to debug. Keep them small and documented.

## 8. Migrations & schema versioning

A **migration** is a file that changes the database **structure**. Think of it as **git for your database schema**.

```
20261122100100-create-customers.js       version 1
20261122100200-create-customer-profiles  version 2
...
20261122100700-add-city-to-customers.js  version 7  <- a change to an existing table
```

- Each file has `up()` (apply) and `down()` (undo).
- `sequelize-cli` writes the names of applied files into the `SequelizeMeta` table, so each one runs **only once**.
- Everyone in the team runs `npm run db:migrate` and gets the same schema. Production gets the same steps too.

**Golden rules**
1. **Never edit a migration that already ran** on someone else's DB / production. Create a new one.
2. Always write a working `down()`.
3. One logical change per migration.
4. Don't use `sequelize.sync()` in production - it can't safely change existing tables. Use migrations.
5. Models describe the table for JS; migrations create it. Keep them in sync.

| Command | What it does |
|---|---|
| `npx sequelize-cli migration:generate --name add-xyz` | create an empty migration file |
| `npm run db:migrate` | run all new migrations |
| `npm run db:migrate:status` | which ones ran (`up`) / not yet (`down`) |
| `npm run db:migrate:undo` | undo the LAST migration |
| `npm run db:migrate:undo:all` | undo everything |

## 9. Transactions & ACID

A **transaction** groups several queries: all succeed (**COMMIT**) or none (**ROLLBACK**).

| Letter | Meaning | Example |
|---|---|---|
| **A**tomicity | all or nothing | order + items + stock update together |
| **C**onsistency | constraints always hold | stock can never be negative |
| **I**solation | parallel transactions don't see each other's unfinished work | |
| **D**urability | after COMMIT, data survives a crash | thanks to WAL |

### Isolation levels

| Level | You may see... |
|---|---|
| `READ COMMITTED` (PostgreSQL default) | each query sees data committed before **that query** started |
| `REPEATABLE READ` | the whole transaction sees one snapshot (from its first query) |
| `SERIALIZABLE` | as if transactions ran one after another; may fail with a serialization error -> retry |

### Locks

- `SELECT ... FOR UPDATE` locks the selected rows until the transaction ends. Use it before "read, check, then update" (like checking stock before selling).
- **Deadlock** = transaction A waits for B, B waits for A. PostgreSQL detects it and cancels one. Avoid it by always locking rows in the same order.

## 10. Indexing & optimization

An **index** is a sorted structure (usually a **B-tree**) that lets PostgreSQL find rows without reading the whole table.

| Index type | Good for |
|---|---|
| B-tree (default) | `=`, `<`, `>`, `BETWEEN`, `ORDER BY`, `LIKE 'abc%'` |
| Composite `(a, b)` | `WHERE a = ?` and `WHERE a = ? AND b > ?` - not `WHERE b = ?` alone |
| Partial `... WHERE is_active` | when you always query a subset |
| Expression `(LOWER(email))` | when the WHERE uses that expression |
| GIN | JSONB, arrays, full-text search |
| BRIN | very large tables sorted by time |

**Index costs:** disk space + slower INSERT/UPDATE/DELETE. Don't index everything.

**PostgreSQL does NOT auto-index foreign keys.** Add them yourself if you join/filter by them.

**Reading EXPLAIN ANALYZE:** `Seq Scan` on a big table with a selective WHERE usually means a missing index. Compare `Execution Time` before and after.

**Checklist**
1. `SELECT` only needed columns
2. Index columns in `WHERE`, `JOIN`, `ORDER BY`
3. Avoid functions on indexed columns in `WHERE` (or use an expression index)
4. Avoid N+1 queries
5. Paginate with `LIMIT`
6. Measure with `EXPLAIN ANALYZE` - don't guess
