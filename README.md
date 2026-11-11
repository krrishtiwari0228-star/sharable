# SupplyDesk — Wholesale Dealer & Distributor Workspace

SupplyDesk is a responsive B2B wholesale operations application for homeware distributors and their dealers.

## Workspaces

- **Distributor:** overview, dealer management, product and stock management, order processing, delivered-sales reporting and account settings.
- **Dealer:** assigned distributor catalogue, carton/box ordering, order tracking, profile and business details, address management and account settings.

## Product capabilities

- Separate authenticated dealer and distributor workspaces. Authorization is derived from the verified Supabase profile, never from a browser-selected role.
- Distributor-scoped products, categories, dealers and orders.
- Product catalogue with SKU, brand, category, image gallery, unit, pack size, minimum order, wholesale price, stock and optional variants.
- Dealer cart and order submission through the trusted `place_wholesale_order` database transaction, which revalidates product ownership, pricing, quantities and available stock.
- Distributor order review and status transitions through database functions.
- Delivered-sales CSV export.
- Account settings for personal details, business information, location, password, legal information and support.
- Responsive web application and a separate Expo Android client foundation.

## Stack

- Next.js App Router, React and TypeScript
- Supabase Auth and PostgreSQL with Row Level Security
- Vercel deployment
- Expo React Native Android client

## Web environment

Configure these exact Vercel environment variable names for Production, Preview and Development:

- `SUPABASE_URL`
- `NEXT_SUPABASE_ANON_KEY`

Use the Supabase project URL and the publishable/anon client key. Never use a Supabase service-role or secret key in the browser or either of these variables.

For local development, copy `.env.example` to `.env.local` and provide the same two values. The live tenant-isolation test additionally requires its dedicated non-production test-account variables.

## Local development

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm run lint
npm run build
npm test
```

The security integration tests require four dedicated non-production Supabase test accounts and a dedicated fixture product. Do not point those tests at real customer accounts or production data.

## Database setup and production readiness

SQL files in `supabase/` are setup scripts and migrations, not interchangeable. Review the comments at the top of each file and apply them in the documented order for the actual database state. In particular:

1. Review the schema and security scripts against the existing Supabase project before applying anything.
2. Apply `supabase/profile_location_fields.sql` to add the business location fields used by Settings.
3. Configure Supabase Auth redirect URLs and email confirmation behaviour for the deployed domain.
4. Verify every table's RLS policies and grants with separate dealer and distributor test identities.
5. Run the tenant-isolation tests against a non-production database.
6. Verify order placement, stock reservation, cancellation and each order-status transition with concurrent requests before using real orders.

The repository's SQL schema is a new-project design. Do not blindly run it over an existing database with business data. Review each migration and back up the database first.

## Security notes

- Browser and API clients use the caller's verified Supabase JWT and the public client key; RLS remains enabled.
- Order placement is performed by a database transaction, not by trusting prices or tenant IDs supplied by the browser.
- Never expose service-role keys, database passwords or other server secrets in client-side code.
