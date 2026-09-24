# Swazei Multi-Tenant POS — Backend Assignment

NestJS · TypeScript · PostgreSQL · Redis

---

## Quick Start

```bash
# 1. Copy env
cp .env.example .env
# Edit .env with your DB/Redis credentials

# 2. Install dependencies
npm install

# 3. Create the database
createdb swazei_pos

# 4. Run migrations
npm run migration:run

# 5. Seed sample data
npm run seed

# 6. Start the server
npm run start:dev
```

Server starts on **http://localhost:3000**

---

## Project Structure

```
src/
├── config/                  # Typed config factories (DB, JWT, Redis)
├── common/
│   ├── decorators/          # @CurrentUser, @Roles
│   ├── guards/              # JwtAuthGuard, RolesGuard
│   └── filters/             # Global exception filter
├── database/
│   ├── entities/            # TypeORM entities
│   ├── migrations/          # SQL migrations
│   └── seeds/               # Seed script
└── modules/
    ├── auth/                # Login → JWT
    ├── merchants/           # Merchant CRUD
    ├── stores/              # Store CRUD (scoped to merchant)
    ├── users/               # User management
    ├── products/            # Product CRUD + Redis cache
    ├── inventory/           # Inventory adjustment
    ├── sales/               # Sale creation (transactional)
    └── payments/            # Payment abstraction + mock provider
```

---

## API Overview

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | — | Login, returns JWT |
| POST | `/merchants` | Admin | Create merchant |
| GET | `/merchants` | Any | List merchants |
| POST | `/stores` | Admin | Create store |
| GET | `/stores` | Any | List stores (own merchant) |
| POST | `/users` | Admin | Create user |
| GET | `/users` | Admin | List users (own merchant) |
| POST | `/stores/:storeId/products` | Admin | Create product |
| GET | `/stores/:storeId/products` | Any | List products (cached) |
| PUT | `/stores/:storeId/products/:id` | Admin | Update product |
| DELETE | `/stores/:storeId/products/:id` | Admin | Soft-delete product |
| GET | `/stores/:storeId/inventory` | Any | View inventory |
| PUT | `/stores/:storeId/inventory/products/:productId` | Admin | Adjust stock |
| POST | `/stores/:storeId/sales` | Any | Create sale |
| GET | `/stores/:storeId/sales` | Any | List sales |
| GET | `/stores/:storeId/sales/:id` | Any | Get sale |

---

## Database & Schema Decisions

- **UUIDs** for all primary keys — safe to expose in URLs, globally unique across tenants.
- **Prices as integer cents** (`bigint`) — avoids floating-point rounding errors.
- **Soft-delete on products** (`isActive = false`) — preserves historical sale records.
- **`CHECK (quantity >= 0)`** on inventory — database-level guard against negative stock.
- **Unique index on `(idempotencyKey, storeId)`** in both `sales` and `idempotency_keys` tables.
- `sale_items.unitPriceCents` is a **price snapshot** taken at sale time from the server, so historical sales are unaffected by future price changes.

---

## Tenant Isolation Approach

Every authenticated request carries a JWT containing `merchantId` and `storeId`.  
The `StoresService.assertSameMerchant()` helper is called in every service that touches store-scoped data. It verifies the requested store's `merchantId` matches the caller's `merchantId` before returning any data.

This means:
- Guessing a foreign UUID in a URL parameter returns **403 Forbidden**, not the data.
- No row-level-security is required at the DB layer; the application enforces it consistently.

---

## Transaction & Concurrency Strategy

Sale creation runs inside a **single PostgreSQL transaction**:

1. `SELECT ... FOR UPDATE` locks the relevant inventory rows by `productId`.
2. Stock validation and deduction happen inside the same transaction.
3. Payment is processed; if it fails, the transaction is rolled back (inventory restored automatically).
4. Sale and idempotency records are written and committed atomically.

**Concurrent sales (POS A + POS B selling the same product):**  
`FOR UPDATE` serializes access to each inventory row. If stock = 5, POS A requests 3 and POS B requests 3, whichever arrives first acquires the lock, deducts stock (→ 2), and commits. POS B then reads quantity = 2 and gets a **400 Insufficient stock** response. No oversell.

---

## Idempotency Approach

The POS terminal generates a UUID per sale attempt and sends it as `idempotencyKey` in the request body.

On every `POST /stores/:storeId/sales`:
1. Check `idempotency_keys` for `(key, storeId)`.
2. If found and `saleId` is set → return the existing sale immediately (no new work).
3. If not found → proceed with the transaction, write the `idempotency_keys` record inside the same transaction as the sale.

A `UNIQUE` constraint on `(key, storeId)` in `idempotency_keys` provides a second safety net: a race between two identical requests will cause one insert to fail at the DB level, preventing double-write.

---

## Redis Caching

**What is cached:** product listings per store (`GET /stores/:storeId/products`).  
**Why:** Products are read frequently (every POS screen load) but written rarely (admin operations).  
**TTL:** 300 seconds (configurable via `REDIS_TTL`).  
**Cache invalidation:** Any write to a product or inventory busts the key `products:store:<storeId>`.

If Redis is unavailable, the application falls back gracefully — the cache miss simply hits PostgreSQL.

---

## Running Tests

```bash
# Unit tests (Jest)
npm run test

# With coverage
npm run test:cov
```

Tests cover:
1. ✅ Successful sale
2. ✅ Failed sale (payment declined)
3. ✅ Insufficient inventory
4. ✅ Cross-tenant access rejected
5. ✅ Duplicate idempotency key (bonus)

---

## Seed Accounts

After running `npm run seed`:

| Email | Password | Role | Merchant |
|-------|----------|------|----------|
| admin.a@example.com | password123 | merchant_admin | Merchant A |
| staff.a1@example.com | password123 | store_staff | Merchant A / Store A1 |
| admin.b@example.com | password123 | merchant_admin | Merchant B |
| staff.b1@example.com | password123 | store_staff | Merchant B / Store B1 |
