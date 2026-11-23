# Migrations - hands-on practice

A **migration** is one versioned step of schema change: an `up()` that applies it and a `down()` that undoes it. Sequelize records every migration that ran in the table **`SequelizeMeta`** - that table *is* your schema version.

```sql
-- pgAdmin: which version is this database at?
SELECT name FROM "SequelizeMeta" ORDER BY name;
```

## Commands

| Command | What it does |
|---|---|
| `npm run db:migrate:status` | `up` = ran, `down` = pending |
| `npm run db:migrate` | runs **all pending** migrations, oldest first |
| `npm run db:migrate:undo` | undoes the **last** migration (runs its `down()`) |
| `npx sequelize-cli db:migrate:undo:all --to 20261122100800-add-indexes.js` | undoes everything **after and including** that file |
| `npx sequelize-cli db:migrate --to 20261122100800-add-indexes.js` | migrates only **up to** that file |
| `npm run db:migrate:undo:all` | undoes everything (empty database) |
| `npx sequelize-cli migration:generate --name <name>` | creates an empty migration file with a timestamp |

## Exercise 1 - run, roll back, run again

Migration [20261123100000-add-loyalty-points-to-customers.js](../src/database/migrations/20261123100000-add-loyalty-points-to-customers.js) adds a column, a CHECK constraint and a unique index - in **one transaction**.

```bash
npm run db:migrate:status      # last line: up 20261123100000-add-loyalty-points...
npm run db:migrate:undo        # reverting...
npm run db:migrate:status      # now: down
```
In pgAdmin, refresh `customers -> Columns`: `loyalty_points` is gone. Then:
```bash
npm run db:migrate             # migrating... -> the column is back (existing rows get 0)
```

## Exercise 2 - see the transaction protect you

1. In the migration's `up()`, change the index line to a typo, e.g. `ON customerz (LOWER(email))`.
2. `npm run db:migrate:undo` then `npm run db:migrate` -> it fails.
3. Check pgAdmin: **no** `loyalty_points` column. Step 1 succeeded but was rolled back with step 3, and `db:migrate:status` still says `down`.
4. Fix the typo, run `npm run db:migrate` again.

Without the transaction you would be stuck with a half-applied migration: `up` fails again ("column already exists") and `down` never runs because the migration is not recorded.

## Exercise 3 - write your own

```bash
npx sequelize-cli migration:generate --name add-discount-to-products
```
Fill it in (practice task 1 in the README), run it, undo it, run it again. Then add the field to [product.model.js](../src/models/product.model.js).

## Rules to remember

1. **Never edit a migration that already ran** on someone else's database (or production). Add a new one.
2. **Every `up()` needs a working `down()`**, undoing the steps in reverse order. Test it: `migrate -> undo -> migrate`.
3. **Several steps? Use a transaction** and pass `{ transaction }` to every call.
4. **New NOT NULL column on a table with data** -> give it a `defaultValue`, or add it nullable, fill it, then set NOT NULL in a later step.
5. **Name your constraints and indexes** (`customers_loyalty_points_not_negative`) - errors and `down()` become easy.
6. **Migrations change structure, seeders insert data.** Keep them apart.
7. **Model and migration must match.** The migration changes the database; the model is only how JavaScript sees it. Update both.
8. **ENUM gotcha:** `dropTable` does not drop the ENUM type. In `down()` also run `DROP TYPE IF EXISTS "enum_orders_status"`.
