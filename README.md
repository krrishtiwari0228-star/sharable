# SupplyDesk — Wholesale Dealer & Distributor Ordering

A responsive B2B wholesale ordering prototype for crockery, glassware, kitchenware, homeware and storage products.

## Business model
- Every distributor has a separate dealer-facing catalogue/portal, mapped to that distributor's tenant.
- Dealers see only the products and orders belonging to their assigned distributor.
- Dealers place wholesale orders by box/carton, can review what they ordered, and can cancel pending orders or request cancellation after confirmation.
- Distributors review incoming orders, confirm or reject them, process/dispatch orders, handle cancellation requests, manage dealers and products, and export delivered-order reports.
- Products include brand, SKU, wholesale price, package unit, pieces per package, minimum order quantity and available stock.
- Optional dealer inventory tracking is represented in the database design for goods received, sold onward, damaged or adjusted.
- A platform-owner role is included in the schema design for managing multiple distributor tenants.

## Current implementation status
The current UI is a **local demo/prototype**. It uses in-memory sample products and orders; refreshing the page resets changes. The role switch is only a preview tool, not production authentication or tenant isolation. No real notification, order, cancellation, payment or stock transaction is sent to a distributor yet.

## Stack
- Next.js App Router + TypeScript
- Supabase Auth, PostgreSQL, Realtime and Storage (backend setup still required)
- Vercel deployment target

## Local setup
1. Install Node.js LTS and Git.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and add your Supabase project URL and anon key.
4. Run `npm run dev`.

## Required before real business use
1. Configure Supabase Auth and distributor/dealer account onboarding.
2. Implement and test least-privilege Row Level Security policies for every table.
3. Implement server-side order creation, confirmation, rejection, cancellation, inventory reservation/release, dispatch and delivery transactions.
4. Validate stock, package units, minimum quantities and price on the server; snapshot prices and discounts into order items.
5. Ensure each order is visible only to its assigned dealer and distributor, and each dealer catalogue is limited to its assigned distributor.
6. Add automated tests for tenant isolation, authorization, order status transitions and stock race conditions.
7. Configure real notifications and audit logs. Add invoice/payment integrations only after requirements are finalized.
8. Never expose a Supabase service-role key in client code.

The updated `supabase/schema.sql` is a new-project schema design. Review it before applying to any existing database; it is not a migration for a database that already contains production data.
