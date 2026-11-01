import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

type TestAccount = { email: string; password: string };
type SignedIn = { client: SupabaseClient; user: User; distributorId?: string };

const TABLES = [
  "profiles",
  "distributors",
  "dealer_profiles",
  "categories",
  "products",
  "orders",
  "order_items",
  "order_status_history",
  "notifications",
  "dealer_inventory",
  "stock_movements",
  "payments",
] as const;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required test environment variable: ${name}`);
  return value;
}

const url = () => required("SUPABASE_URL");
const anonKey = () => required("SUPABASE_ANON_KEY");

function account(prefix: string): TestAccount {
  return {
    email: required(`${prefix}_EMAIL`),
    password: required(`${prefix}_PASSWORD`),
  };
}

function makeClient(key = anonKey()) {
  return createClient(url(), key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function signIn(prefix: string): Promise<SignedIn> {
  const client = makeClient();
  const credentials = account(prefix);
  const { data, error } = await client.auth.signInWithPassword(credentials);
  if (error || !data.user) {
    throw new Error(`Could not sign in ${prefix}: ${error?.message ?? "No user returned"}`);
  }

  const result: SignedIn = { client, user: data.user };

  if (prefix.startsWith("TEST_DISTRIBUTOR")) {
    const { data: distributor, error: distributorError } = await client
      .from("distributors")
      .select("id")
      .eq("owner_id", data.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (distributorError || !distributor) {
      throw new Error(
        `${prefix} must own an active distributor record: ${distributorError?.message ?? "No distributor found"}`,
      );
    }
    result.distributorId = distributor.id;
  }

  return result;
}

function expectNoRowsOrAccessDenied(
  data: unknown[] | null,
  error: { code?: string; status?: number; message?: string } | null,
  label: string,
) {
  // A permission error is also a valid denial. A successful query must return zero rows.
  if (error) {
    const denied =
      error.status === 401 ||
      error.status === 403 ||
      error.code === "42501" ||
      /permission denied|not allowed|unauthorized|forbidden/i.test(error.message ?? "");
    expect(denied, `${label}: unexpected database error ${error.code ?? ""} ${error.message ?? ""}`).toBe(true);
    return;
  }
  expect(data ?? [], label).toHaveLength(0);
}

describe("SupplyDesk tenant isolation (live Supabase)", () => {
  let dealerA: SignedIn;
  let dealerB: SignedIn;
  let distributorA: SignedIn;
  let distributorB: SignedIn;
  let anon: SupabaseClient;

  beforeAll(async () => {
    // Dedicated test identities only. Do not use production customer accounts.
    required("SUPABASE_URL");
    required("SUPABASE_ANON_KEY");
    dealerA = await signIn("TEST_DEALER_A");
    dealerB = await signIn("TEST_DEALER_B");
    distributorA = await signIn("TEST_DISTRIBUTOR_A");
    distributorB = await signIn("TEST_DISTRIBUTOR_B");
    anon = makeClient();
  }, 30_000);

  afterAll(async () => {
    await Promise.all(
      [dealerA, dealerB, distributorA, distributorB]
        .filter(Boolean)
        .map(({ client }) => client.auth.signOut()),
    );
  });

  it("Dealer A cannot read Dealer B orders", async () => {
    const { data, error } = await dealerA.client
      .from("orders")
      .select("id")
      .eq("dealer_id", dealerB.user.id);

    expect(error, error?.message).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("Dealer A cannot read Distributor B products", async () => {
    const { data, error } = await dealerA.client
      .from("products")
      .select("id")
      .eq("distributor_id", distributorB.distributorId!);

    expect(error, error?.message).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("Dealer cannot update a product price", async () => {
    const productId = required("TEST_DISTRIBUTOR_A_PRODUCT_ID");

    const { data: before, error: beforeError } = await distributorA.client
      .from("products")
      .select("id, price")
      .eq("id", productId)
      .eq("distributor_id", distributorA.distributorId!)
      .single();

    expect(beforeError, beforeError?.message).toBeNull();
    expect(before, "The fixture product must belong to Distributor A").toBeTruthy();

    const originalPrice = Number(before!.price);
    const attemptedPrice = originalPrice + 1;

    const { data: changed, error: updateError } = await dealerA.client
      .from("products")
      .update({ price: attemptedPrice })
      .eq("id", productId)
      .select("id, price");

    // Either a privilege/RLS error or a successful zero-row update is a denial.
    if (updateError) {
      expect(
        updateError.code === "42501" ||
          updateError.status === 401 ||
          updateError.status === 403 ||
          /permission denied|not allowed|unauthorized|forbidden/i.test(updateError.message),
        `Unexpected update error: ${updateError.message}`,
      ).toBe(true);
    } else {
      expect(changed ?? []).toHaveLength(0);
    }

    const { data: after, error: afterError } = await distributorA.client
      .from("products")
      .select("price")
      .eq("id", productId)
      .single();

    expect(afterError, afterError?.message).toBeNull();
    expect(Number(after!.price)).toBe(originalPrice);
  });

  it("Distributor A cannot read Distributor B dealer profiles", async () => {
    const { data, error } = await distributorA.client
      .from("dealer_profiles")
      .select("user_id")
      .eq("distributor_id", distributorB.distributorId!);

    expect(error, error?.message).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("anon cannot read rows from any public application table", async () => {
    for (const table of TABLES) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      expectNoRowsOrAccessDenied(data, error, `anon access to public.${table}`);
    }
  });
});
