# Multi-Tenant POS

## Project Title and Description

I built a point-of-sale API for multiple merchants. A platform admin creates merchants; each merchant manages its stores, products, inventory, and staff. Staff accounts are assigned to a store and can use store-scoped POS operations.

## Tech Stack

- TypeScript and NestJS
- PostgreSQL with Sequelize
- Redis-backed product caching, with an in-memory fallback
- JWT authentication
- Jest unit and integration tests

## Installation and Setup

Requirements: Node.js, npm, PostgreSQL, and Redis (optional).

```bash
git clone https://github.com/geekycodermanish/Multi-Tenant-POS.git
cd Multi-Tenant-POS
npm install
cp .env.example .env
```

Set `PLATFORM_ADMIN_EMAIL` and `PLATFORM_ADMIN_PASSWORD` in `.env`. Set the database connection values if they differ from the defaults. Create the database, run the migrations, seed demo accounts, and start the development server:

```bash
createdb swazei_pos
npm run migration:run
npm run seed
npm run start:dev
```

The seed uses `password321` for the sample merchant admin and staff accounts. The platform admin uses the email and password configured in `.env`. These are for local development only.

Check that the server can reach the database:

```bash
curl http://localhost:3000/health/database
```

## Usage and Examples

The API is available at `http://localhost:3000`. The main workflow is platform admin → merchant admin → store → staff, products and inventory → sales.

Log in with a seeded user to get an access token:

```bash
curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"rahul@zodio.example.com","password":"password321"}'
```

Use the returned `accessToken` as a bearer token on protected routes. A staff user can create a sale for their assigned store. Replace the placeholders with IDs returned by the API:

```bash
curl -X POST http://localhost:3000/stores/<storeId>/sales \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Idempotency-Key: sale-001' \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"productId":"<productId>","quantity":2}],"paymentMethod":"cash"}'
```

The server reads product prices and calculates the total. Import [postman-collection.json](./postman-collection.json) to explore the API requests organized by merchant and store.

Run tests with:

```bash
npm run test:unit
npm run test:int
```

## Contribution Guidelines

Please open an issue to discuss a proposed change. For a contribution, create a focused branch, make the change, run the relevant tests, and submit a pull request with a short description of the behavior changed.

## License

The project has no `LICENSE` file, and `package.json` marks it as `UNLICENSED`.

## Contact and Credits

For questions or bug reports, open an issue in the [GitHub repository](https://github.com/geekycodermanish/Multi-Tenant-POS). This project uses NestJS, Sequelize, PostgreSQL, Redis, and Jest.
