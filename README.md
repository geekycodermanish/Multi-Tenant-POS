# Multi-Tenant POS API

## 1. Overview

I built a point-of-sale API for multiple merchants. Each merchant owns stores; products and their inventory belong to a store. The API is written in NestJS and TypeScript. It uses PostgreSQL through Sequelize, Redis through the Nest cache manager, JWT authentication, and Jest tests.

```text
Merchant
└── Store
    ├── Products
    └── Inventory
```

## 2. Prerequisites and quick start

I use Node.js and npm. I ran the current checks with Node.js 22.17.0; the package manifest does not declare a minimum Node.js version. I use a PostgreSQL server with `createdb` available. Redis is optional for product caching; the current AppModule attempts a Redis connection during startup and falls back to an in-memory cache when that connection fails.

From a fresh checkout:

```bash
git clone https://github.com/geekycodermanish/Multi-Tenant-POS.git
cd Multi-Tenant-POS
npm install
cp .env.example .env
```

Set the PostgreSQL values and choose `PLATFORM_ADMIN_EMAIL` and a `PLATFORM_ADMIN_PASSWORD` of at least eight characters in `.env`. Create the database named by `DB_NAME`. With the example values:

```bash
createdb swazei_pos
npm run migration:run
npm run seed
npm run start:dev
```

The development server listens on port `3000` by default. I can check the database health endpoint with:

```bash
curl http://localhost:3000/health/database
```

The current health response includes a timestamp and a `database` object. The service currently includes status/message fields in that object, including error text when a database check fails.

The seed creates a platform admin using the two platform-admin environment variables, plus these demo tenant users. The `password123` credentials are demo data only; I do not use them for a deployed system.

| Email | Role | Merchant | Store | Demo password |
|---|---|---|---|---|
| Value of `PLATFORM_ADMIN_EMAIL` | `platform_admin` | None | None | Value of `PLATFORM_ADMIN_PASSWORD` |
| `admin.a@example.com` | `merchant_admin` | Merchant A | Not assigned to a store | `password123` |
| `staff.a1@example.com` | `store_staff` | Merchant A | Store A1 | `password123` |
| `admin.b@example.com` | `merchant_admin` | Merchant B | Not assigned to a store | `password123` |
| `staff.b1@example.com` | `store_staff` | Merchant B | Store B1 | `password123` |

The seed also creates Store A2 and products for Store A1 and Store B1. It does not create a Store A2 staff user.

## 3. Environment variables

This table matches the committed `.env.example`. The application code currently supplies defaults for these variables; values below are the example configuration, not a claim that the code validates them.

| Name | Required by current code | Purpose | Example |
|---|---|---|---|
| `PORT` | No | HTTP listen port | `3000` |
| `NODE_ENV` | No | Environment label and Sequelize logging selection | `development` |
| `DB_HOST` | No | PostgreSQL host | `localhost` |
| `DB_PORT` | No | PostgreSQL port | `5432` |
| `DB_USERNAME` | No | PostgreSQL username | `postgres` |
| `DB_PASSWORD` | No | PostgreSQL password | `postgres` |
| `DB_NAME` | No | PostgreSQL database name | `swazei_pos` |
| `JWT_SECRET` | No, but required for secure deployment | JWT signing and verification secret | `change-me-in-production` |
| `JWT_EXPIRES_IN` | No | JWT expiry passed to Nest JWT | `8h` |
| `PLATFORM_ADMIN_EMAIL` | Required by `npm run seed` | Email for the platform account that creates merchants | Set your own |
| `PLATFORM_ADMIN_PASSWORD` | Required by `npm run seed` | Password for the platform admin; minimum eight characters | Set your own |
| `REDIS_HOST` | No | Redis host | `localhost` |
| `REDIS_PORT` | No | Redis port | `6379` |
| `REDIS_TTL` | No | Redis cache TTL in seconds | `300` |
| `PAYMENT_FAIL_RATE` | No | Mock payment failure probability from 0 to 1 | `0` |

I found no missing or unused variables when comparing direct environment reads and configuration reads with `.env.example`. The database and JWT configuration currently have fallback values in code. The seed requires the platform-admin values explicitly. In particular, `JWT_SECRET=change-me-in-production` is not suitable as a production secret.

## 4. Project structure

```text
src/
├── app.module.ts
├── app.setup.ts
├── config/
├── common/
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   ├── health/
│   └── services/
├── database/
│   ├── entities/
│   ├── migrations/
│   └── seeds/
└── modules/
    ├── auth/
    ├── merchants/
    ├── stores/
    ├── users/
    ├── products/
    ├── inventory/
    ├── sales/
    └── payments/
```

| Module | Responsibility |
|---|---|
| `auth` | Checks credentials and issues JWTs. |
| `merchants` | Lets the platform admin create a merchant and its first merchant admin; tenant users can read their own merchant. |
| `stores` | Creates and lists stores and checks store access. |
| `users` | Lets merchant admins create store staff and list users in their own merchant. |
| `products` | Creates, lists, updates, and deactivates store products. |
| `inventory` | Reads and adjusts store inventory. |
| `sales` | Creates sales, checks idempotency, locks inventory, and reads sales. |
| `payments` | Provides the payment interface and mock implementation. |
| `common/health` | Exposes health routes and connection checks. |
| `database` | Defines Sequelize models, migrations, and seed data. |

There is no separate repository class. Services use Sequelize models directly through `@nestjs/sequelize`. I kept that data access in the service layer because the current operations are model queries and transactions, and an extra repository abstraction would duplicate the Sequelize API without an existing domain-specific query layer to encapsulate.

## 5. Database and schema decisions

The migrations create merchants, stores, users, products, inventories, sales, sale items, payments, and idempotency keys. UUIDs are used for entity primary keys. A store belongs to a merchant. Merchant admins and store staff belong to a merchant; the platform admin has no merchant or store assignment. A store staff user has one required store assignment. Products and inventories refer to a store; inventory also refers to a product. A sale refers to a store and optionally the user who created it. Sale items refer to a sale and product. A payment refers to a sale. An idempotency key is scoped by key and store and may refer to the created sale.

The schema is created by `1700000000000-InitSchema.ts`, `1791350108000-AddSalesBillNumber.ts`, and `1791350944000-RebuildSalesIdempotency.ts`. `1800000000000-AddPlatformAdminRole.ts` adds the `platform_admin` role and allows only platform users to have a null `merchantId`. Its down migration refuses to remove the role while platform admin accounts still exist.

Prices, subtotals, sale totals, and payment amounts are integer cents stored in PostgreSQL `BIGINT` columns. Product price is read from the database; clients do not provide the sale price.

The migrations create the following explicit constraints and indexes:

| Name | Type | Purpose |
|---|---|---|
| `PK_merchants`, `PK_stores`, `PK_users`, `PK_products`, `PK_inventories`, `PK_sales`, `PK_sale_items`, `PK_payments`, `PK_idempotency_keys` | Primary keys | Identify rows in their respective tables. |
| `UQ_merchants_name` | Unique | Prevent duplicate merchant names. |
| `UQ_merchants_email` | Unique | Prevent duplicate merchant emails. |
| `FK_stores_merchant` | Foreign key | Keep each store attached to a merchant. |
| `IDX_stores_merchantId` | Index | Find stores for a merchant. |
| `UQ_users_email` | Unique | Prevent duplicate user emails. |
| `IDX_users_email` | Index | Support user lookup by email. |
| `IDX_users_merchantId` | Index | Find users for a merchant. |
| `IDX_users_storeId` | Index | Find users assigned to a store. |
| `FK_users_merchant`, `FK_users_store` | Foreign keys | Keep user tenant and store references valid. |
| `IDX_products_storeId` | Index | Find products for a store. |
| `FK_products_store` | Foreign key | Keep products attached to a store. |
| `UQ_inventories_product` | Unique | Allow one inventory row per product. |
| `CHK_inventory_qty` | Check | Reject negative inventory quantity. |
| `IDX_inventories_storeId` | Index | Find inventory rows for a store. |
| `FK_inventories_product`, `FK_inventories_store` | Foreign keys | Keep inventory product and store references valid. |
| `IDX_sales_storeId` | Index | Find sales for a store. |
| `IDX_sales_storeId_idempotencyKey` | Unique index | Prevent duplicate sale keys within one store. |
| `IDX_sales_storeId_billNumber` | Unique index | Keep bill numbers unique within a store. |
| `FK_sales_store`, `FK_sales_user` | Foreign keys | Keep sale store and creator references valid. |
| `FK_sale_items_sale`, `FK_sale_items_product` | Foreign keys | Keep sale item references valid. |
| `UQ_payments_saleId` | Unique | Allow at most one payment row per sale. |
| `FK_payments_sale` | Foreign key | Keep a payment attached to a sale. |
| `UQ_idempotency_key_store` | Unique | Enforce idempotency key uniqueness per store. |
| `FK_idempotency_keys_sale` | Foreign key | Tie a completed key to its sale. |

The first migration initially creates a global unique constraint on the sales `idempotencyKey`. A later migration replaces it with a unique index on `(storeId, idempotencyKey)`, matching the idempotency table's store-scoped key uniqueness.

`billNumber` values come from the PostgreSQL sequence `sales_bill_seq`. The sequence is global, not per store. Sequence values can have gaps when a transaction rolls back. I chose a sequence instead of a per-store counter so concurrent sales do not contend on a counter row.

## 6. Authentication and roles

`POST /auth/login` accepts an email and password. It only authenticates active users. The returned JWT payload contains `sub`, `email`, `role`, `merchantId`, and `storeId`; both IDs are `null` for the platform admin. The strategy loads the active user again when validating a token.

| Role | Access in the controllers |
|---|---|
| `platform_admin` | Can create merchants. That operation also creates the merchant's first `merchant_admin` in the same transaction. It cannot use tenant routes or create stores, staff, products, or sales. |
| `merchant_admin` | Can create stores and products, create `store_staff` users, update/deactivate products, adjust inventory, and use tenant routes within its merchant. |
| `store_staff` | Can read products and inventory and create/read sales only for the single assigned store. It cannot create or change users, stores, products, or inventory. |

There is no public registration route. I provision the first platform admin through the seed environment variables. A platform admin creates a merchant and its first merchant admin through `POST /merchants`. That merchant admin creates stores, staff, and products. A merchant admin cannot create another merchant admin through `POST /users`; it creates store staff only, with a required store assignment. The application uses 404 for inaccessible tenant-owned stores and resources to avoid confirming that another tenant's resource exists. `RolesGuard` returns 403 for authenticated users who lack a role required by a route.

## 7. Tenant isolation

`StoresService.assertStoreAccess` loads the requested store and compares its merchant with the caller's merchant. For non-admin users it also checks that the requested store matches the user's assigned store.

Store-scoped services call this check before accessing store data. Product lookups include both the product ID and route `storeId`; updates and deactivation use the same scope. Sales and inventory operations also pass the route's store ID to their access check.

This binding matters for ID-swap attempts. Supplying a valid product UUID from Store A2 in a Store A1 route does not authorize a lookup outside Store A1.

The integration specs intended to cover these rules are:

| Scenario | Spec |
|---|---|
| Cross-merchant and cross-store resource access | `test/integration/tenant-isolation.int-spec.ts` |
| Store-scoped ID checks in sales and products | `test/integration/tenant-isolation.int-spec.ts` |
| Store access service behavior | `src/modules/sales/sales-access.spec.ts` |

The current tenant-isolation integration suite is not fully passing. One test sends `quantityDelta` to the inventory adjustment route, while the DTO accepts `quantity`; the global validation pipe returns 400 before the authorization check. I have listed this in Known limitations and have not described that assertion as passing.

## 8. Sale flow

The service currently performs these steps:

1. Resolve the user and idempotency key arguments.
2. Check access to the route store with `assertStoreAccess`.
3. Validate that the `Idempotency-Key` value is 8-128 characters and contains only letters, numbers, underscores, or hyphens.
4. Build a canonical request hash and look for an existing key for this store. If a completed sale is found, return its mapped response. A payload mismatch is rejected with 422.
5. Start a `READ COMMITTED` transaction and insert the idempotency claim as its first database operation.
6. Merge duplicate product IDs and validate each summed quantity.
7. Load inventory rows for requested products in sorted product ID order with `SELECT FOR UPDATE`.
8. Load active products for the store. Check product and inventory existence and available quantity.
9. Calculate each line subtotal and the total from the server-side product prices, and decrement inventory in the transaction.
10. Allocate a bill number from `sales_bill_seq`, create the pending sale, and create sale item price snapshots.
11. Mark payment attempted, call the payment provider, and write the payment row.
12. If payment fails, throw a bad request exception so the transaction rolls back. If it succeeds, mark the sale completed and attach its ID to the idempotency claim.
13. Commit the transaction, invalidate the store's product cache version, and return the mapped sale response.

## 9. Transactions and concurrency

I use `READ COMMITTED` for sale transactions. The service selects inventory rows for update in ascending `productId` order, then validates and decrements stock within that transaction. The database also has `CHECK (quantity >= 0)`.

The retry helper retries PostgreSQL deadlock (`40P01`) and serialization (`40001`) errors only if payment has not been attempted in that attempt. It does not retry after the payment provider call has been attempted.

For the assignment case—stock 5 and two concurrent sales of 3—the intended transaction behavior is that one transaction locks the row, deducts to 2, and commits. The other then sees insufficient stock and gets a 4xx response. Exactly one sale succeeds, and final stock is 2. The concurrency spec exercises this case; the current integration run passes that spec.

I use `READ COMMITTED` with explicit row locks instead of `SERIALIZABLE`. The lock protects the inventory rows being modified, sorted lock acquisition reduces deadlock risk for multi-product sales, and the lower isolation level avoids unnecessary serialization conflicts.

## 10. Idempotency

Clients send the key in the `Idempotency-Key` header; it is not a sale body field. The service hashes the request payload, scopes lookup and claim uniqueness by store, and inserts the claim as the first database statement inside the transaction. The unique constraint is `(key, storeId)`.

| Request case | Current service behavior |
|---|---|
| Same key and same payload after a completed sale | Returns the existing mapped sale response (201 through the controller). |
| Same key with a different payload | Returns 422. |
| Concurrent requests with the same key and payload | The claim uniqueness prevents multiple committed claims; the loser looks up and returns the winner when available. |
| First attempt fails before commit | The transaction rolls back, including its idempotency claim; a later attempt may reuse the key. |
| Missing or malformed key | Returns 400. |

The parallel same-key integration spec currently passes five different keys because its request builder uses `parallel-key-${index}`. Its assertion expects one bill number and currently fails with five sales, payments, and provider calls. This is a test setup mismatch; I have not described that particular integration assertion as passing.

## 11. Payment abstraction

The service depends on `IPaymentProvider` through the `PAYMENT_PROVIDER` token. `PaymentsModule` binds that token to `MockPaymentProvider`.

The mock reads `PAYMENT_FAIL_RATE` each time it charges. `0` always succeeds, `1` always fails, and a value such as `0.3` fails with that probability. To force failure, set `PAYMENT_FAIL_RATE=1` before starting the server.

When the provider returns failure, the service writes a failed payment row in the transaction and then throws a 400 response. The transaction rolls back the sale, payment row, and inventory decrement. The external mock call itself cannot be rolled back.

## 12. Redis caching

The product list endpoint caches active products and included inventory per store. `ProductCacheService` stores a per-store version token at `products:ver:<storeId>` and includes that version in the product-list cache key.

The product-list TTL is 60 seconds. The version token is written with a 24-hour TTL. Cache operations race a 500ms timeout. Cache read, write, version, or invalidation errors are logged as warnings and handled as cache misses or skipped writes/invalidation; database reads still serve product results.

The application attempts to create a Redis store during AppModule initialization. If Redis is unavailable, AppModule catches the connection error and configures the cache module with its default in-memory store. A successful Redis connection creates a client which the current application does not explicitly disconnect at shutdown; this has caused Jest to report an open handle.

Product creation, product update, product deactivation, inventory adjustment, and successful sale completion invalidate the store by changing its version token. Sale invalidation happens after the transaction returns.

## 13. API reference

`JwtAuthGuard` requires a bearer token. `RolesGuard` restricts the platform admin to explicitly platform-authorized routes; tenant operations remain scoped by the service.

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/auth/login` | Public | Authenticate and return a JWT. |
| POST | `/merchants` | `platform_admin` | Create a merchant and its first merchant admin atomically. |
| GET | `/merchants` | `merchant_admin`, `store_staff` | List the caller's merchant. |
| GET | `/merchants/:id` | `merchant_admin`, `store_staff` | Read a merchant visible to the caller. |
| POST | `/stores` | `merchant_admin` | Create a store for the caller's merchant. |
| GET | `/stores` | `merchant_admin`, `store_staff` | List stores visible to the caller. |
| GET | `/stores/:id` | `merchant_admin`, `store_staff` | Read a store visible to the caller. |
| POST | `/users` | `merchant_admin` | Create store staff in the caller's merchant with a required `storeId`. |
| GET | `/users` | `merchant_admin` | List users in the caller's merchant. |
| GET | `/users/:id` | `merchant_admin` | Read a user in the caller's merchant. |
| POST | `/stores/:storeId/products` | `merchant_admin` | Create a product and zero-stock inventory row. |
| GET | `/stores/:storeId/products` | `merchant_admin`, `store_staff` | List active products and inventory. |
| GET | `/stores/:storeId/products/:id` | `merchant_admin`, `store_staff` | Read an active product in the route store. |
| PUT | `/stores/:storeId/products/:id` | `merchant_admin` | Update a product. |
| DELETE | `/stores/:storeId/products/:id` | `merchant_admin` | Deactivate a product. |
| GET | `/stores/:storeId/inventory` | `merchant_admin`, `store_staff` | List inventory in the route store. |
| PUT | `/stores/:storeId/inventory/products/:productId` | `merchant_admin` | Set an absolute inventory quantity. |
| POST | `/stores/:storeId/sales` | `merchant_admin`, `store_staff` | Create a sale; requires `Idempotency-Key`. |
| GET | `/stores/:storeId/sales` | `merchant_admin`, `store_staff` | List sales in the route store. |
| GET | `/stores/:storeId/sales/:id` | `merchant_admin`, `store_staff` | Read a sale in the route store. |
| GET | `/health` | Public | Check all connections. |
| GET | `/health/database` | Public | Check PostgreSQL. |
| GET | `/health/cache` | Public | Check the cache manager. |

The login body uses `email` and `password`:

```http
POST /auth/login
Content-Type: application/json

{"email":"staff.a1@example.com","password":"password123"}
```

The platform admin creates a merchant and its first merchant admin in one request:

```json
{
  "name": "Northside Market",
  "email": "contact@northside.example",
  "adminName": "Merchant Owner",
  "adminEmail": "owner@northside.example",
  "adminPassword": "use-a-private-password"
}
```

The created owner can then log in and create stores. The owner creates staff with `name`, `email`, `password`, and a required `storeId`; staff accounts are always assigned the `store_staff` role.

The response includes `accessToken` and a user summary. Authenticated requests use:

```http
Authorization: Bearer <accessToken>
```

A create-sale request uses the header and does not include an idempotency key or price in its body:

```http
POST /stores/<storeA1Id>/sales
Authorization: Bearer <staffToken>
Idempotency-Key: <unique-key>
Content-Type: application/json

{
  "items": [{"productId":"<productId>","quantity":2}],
  "paymentMethod":"cash"
}
```

A successful response is mapped with fields such as:

```json
{
  "saleId": "uuid",
  "billNumber": "BILL-00000001",
  "status": "completed",
  "paymentStatus": "success",
  "total": 500,
  "items": [
    {"productId":"uuid","name":"Coffee","quantity":2,"unitPrice":250,"subtotal":500}
  ],
  "createdAt": "timestamp"
}
```

Replaying the same key and same request after completion returns the same mapped sale and bill number. Reusing the key with a different payload returns 422.

## 14. Testing

The unit suite is `npm run test:unit`. The integration suite is `npm run test:int`. `npm test` runs the unit suite followed by the integration suite. Integration tests use PostgreSQL, reset the test database schema and run the Umzug migrations in Jest global setup, then truncate tables between tests. Set up `.env.test` with a database name ending in `_test`; the existing local example uses `pos_test`.

For a local PostgreSQL setup, create the test database and configure `.env.test` to match:

```bash
createdb pos_test
cp .env.test.example .env.test
npm run test:int
```

The global test setup refuses to proceed unless the configured DB name ends in `_test`. It drops and recreates the public schema in that database, so it must not point at development or production data.

| Assignment scenario | Test file |
|---|---|
| Sales success, payment failure, response fields | `test/integration/sales-success-failure.int-spec.ts` |
| Inventory checks and rollback | `test/integration/sales-inventory.int-spec.ts` |
| Tenant and ID-swap isolation | `test/integration/tenant-isolation.int-spec.ts` |
| Same-key replay and payload mismatch | `test/integration/idempotency.int-spec.ts` |
| Concurrent inventory sales and lock order | `test/integration/concurrency.int-spec.ts` |
| Regressions and cache invalidation | `test/integration/regressions.int-spec.ts` |
| Authentication behavior | `test/integration/auth.int-spec.ts` |
| Platform merchant onboarding and merchant staff provisioning | `test/integration/platform-admin.int-spec.ts` |

The integration harness replaces the payment provider and overrides the cache manager with in-memory test doubles. PostgreSQL, migrations, Nest HTTP routes, validation, and Sequelize transactions are real. AppModule's async Redis store factory still runs during module compilation, so a Redis connection is still attempted even when the cache manager provider is overridden.

Current run results:

| Command | Result |
|---|---|
| `npm run test:unit` | 12 suites passed; 64 tests passed. |
| `npm run test:int` | 3 suites failed, 5 passed; 3 tests failed, 28 passed, 31 total. |

The failing integration tests are:

| Test | Current observed result |
|---|---|
| `tenant isolation › returns 404 when another merchant or store staff accesses A1 resources` | Expected 404; got 400 because the spec sends `quantityDelta` instead of the DTO's `quantity`. |
| `idempotency › handles the same key and same body for parallel requests without duplicates` | Expected one bill number; got five. The test constructs five distinct keys. The diagnostic run observed five sales, five payments, and five calls to the fake provider. |
| `auth integration › rejects wrong passwords and unknown users with the same message` | Expected the `error` field to be a string; it is an object containing the Unauthorized response, whose `message` is `"Invalid credentials"`. |

The integration command also prints that Jest did not exit after the suite and recommends `--detectOpenHandles`. The platform onboarding integration test passes. The test module can connect to Redis at `localhost:6379`, and the client is not explicitly disconnected.

## 15. Trade-offs, assumptions, and known limitations

- I call the payment provider while inventory row locks are held. That is acceptable for this local mock because the call is quick and deterministic apart from its configured failure rate. A production flow should reserve stock, commit, charge, then confirm or compensate.
- Idempotency key rows do not expire. A production deployment would need a retention and cleanup policy.
- A failed sale attempt rolls back its idempotency claim, so the key is not persisted by that failed transaction.
- There can be a brief stale product-list read between transaction commit and cache version invalidation. The list TTL bounds stale entries to 60 seconds in the normal cache path.
- Old versioned cache entries are not deleted on invalidation; they expire according to their cache TTL.
- Bill sequence values can have gaps after rollback and are global across stores.
- A mock payment cannot be refunded or rolled back after the provider call.
- The seed uses the shared demo password `password123`. It is for local data only.
- The seed script has no production-environment guard. It does not overwrite an existing platform admin password, and when Merchant A already exists it skips all demo fixture inserts rather than repairing partial fixture data.
- There is no explicit pagination limit in the controller signatures; list endpoints return the service query result without pagination options.
- `.env.example` contains a placeholder-like but weak `JWT_SECRET`, and the current config falls back to `change-me-in-production` if it is absent. I do not treat that as production-safe.
- The health service currently returns error messages in its response objects. It does not meet a contract that excludes internal database or cache error text.
- The integration suite currently has the three failures listed in Testing. I have not changed or hidden those unrelated specs while implementing platform onboarding.
- Jest reports an open handle after integration runs. AppModule attempts a real Redis connection during testing, and the application does not explicitly close that Redis client.

## 16. Reviewer feedback and what I changed

| Finding | Root cause | Fix | Test that covers it |
|---|---|---|---|
| Admin privilege escalation | A caller-controlled user role could otherwise grant broader access. | User creation is restricted to merchant admins and is scoped to the caller's merchant. | `test/integration/regressions.int-spec.ts`; `src/modules/users/users.service.spec.ts` |
| Concurrency blocking and oversell risk | Concurrent sales could act on the same stock without an explicit deterministic lock order. | Use `READ COMMITTED`, lock inventory rows ordered by product ID, and keep the stock check/decrement in the transaction. | `test/integration/concurrency.int-spec.ts` |
| Empty sale response | The create path did not return the same useful response shape as the read path. | Map the created sale and sale items into the create response. | `src/modules/sales/sales-create.spec.ts`; `test/integration/sales-success-failure.int-spec.ts` |
| Cross-branch authorization | Resource IDs alone did not bind every query to the route store. | Check store access and include store scope in product and sale reads. | `test/integration/tenant-isolation.int-spec.ts`; `src/modules/sales/sales-access.spec.ts` |
| Redis cache not refreshing | Product list results could remain under a key after product or stock writes. | Use a per-store version token and invalidate it after relevant writes. | `src/modules/products/product-cache.service.spec.ts`; `test/integration/regressions.int-spec.ts` |

The first four scenario areas have related tests, but the current `tenant-isolation.int-spec.ts` suite contains a failing request caused by its invalid inventory DTO body. The cache unit tests pass; the full integration run still has the failures listed above.

## 17. Postman

I included `postman-collection.json` as a Postman Collection v2.1 file. Import it through Postman's Import action. Set `baseUrl` to the running server URL; the default collection value is `http://localhost:3000`.

Run the folders from top to bottom. First log in the platform admin using the credentials configured in the server `.env`. The Merchants folder creates two merchants, their first merchant admins, and logs in those admins. Stores then creates two stores per merchant; Users creates one staff account per store and logs each staff member in; Products and Inventory create store-specific products and stock. The collection saves generated IDs and tokens into variables as the requests run.

Run Sales before Scenarios. Sales creates a successful sale as Store A1 staff and saves its bill number and ID. Scenarios verifies the stock change and same-key replay, then checks payload mismatch, missing key, insufficient stock, client-sent price, tenant isolation, role restrictions, and payment failure.

The first create-sale request generates the `Idempotency-Key` value and sends it as a header. Keep that collection variable unchanged through the replay and payload-mismatch requests. The payment-failure request description explains how to set `PAYMENT_FAIL_RATE=1` before starting the server.
