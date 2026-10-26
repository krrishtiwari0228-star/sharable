# Grocery Distributor & Dealer Ordering System

A responsive B2B ordering portal for a grocery distributor and approved dealers.

## Features planned
- Dealer registration/login and distributor admin role
- Grocery catalogue with unit types (piece, packet, box, carton)
- Cart and order submission
- Distributor order notifications and accept/reject workflow
- Stock reservation on acceptance and release on cancellation/rejection
- Mark accepted orders as delivered
- Sales ledger and CSV export that opens in Excel
- Dealer order history and status tracking

## Stack
- Next.js App Router + TypeScript
- Supabase Auth, PostgreSQL, Realtime and Storage
- Vercel deployment

## Current status
This repository starts with the user-interface prototype and database schema plan. Before using it for real orders, configure Supabase, apply the schema, implement and test server-side order/stock transactions, and set Row Level Security policies. Do not put service-role keys in browser code.

## Local setup
1. Install Node.js LTS and Git.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and fill in Supabase project URL and anon key.
4. Run `npm run dev`.

The UI demo can be previewed before backend credentials are configured, but authentication and real-time orders require Supabase setup.
