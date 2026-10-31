import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type OrderItemInput = {
  product_id: string;
  quantity: number;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function createUserScopedClient(accessToken: string): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  // This client uses only the public anon key and the caller's verified JWT.
  // RLS remains active for every database query.
  return createClient(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function getRequestContext(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { error: jsonError("Authentication required.", 401) } as const;
  }

  const supabase = createUserScopedClient(match[1]);
  if (!supabase) {
    return { error: jsonError("Supabase server configuration is missing.", 500) } as const;
  }

  // getUser(token) validates the JWT with Supabase Auth; do not trust client role IDs.
  const { data, error } = await supabase.auth.getUser(match[1]);
  if (error || !data.user) {
    return { error: jsonError("Your session is invalid or expired. Sign in again.", 401) } as const;
  }

  return { supabase, user: data.user } as const;
}

export async function GET(request: NextRequest) {
  const context = await getRequestContext(request);
  if ("error" in context) return context.error;

  const { supabase, user } = context;

  // Distributor accounts are resolved by the authenticated owner ID.
  const { data: distributor, error: distributorError } = await supabase
    .from("distributors")
    .select("id")
    .eq("owner_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (distributorError) {
    return jsonError(distributorError.message, 400);
  }

  if (distributor) {
    const { data: orders, error } = await supabase
      .from("orders")
      .select("*, dealer_profiles(*), order_items(*)")
      .eq("distributor_id", distributor.id)
      .order("created_at", { ascending: false });

    if (error) return jsonError(error.message, 400);

    return NextResponse.json(
      { role: "distributor", orders: orders ?? [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  // Dealer rows are keyed by user_id in this project's existing schema.
  const { data: dealer, error: dealerError } = await supabase
    .from("dealer_profiles")
    .select("user_id, distributor_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (dealerError) return jsonError(dealerError.message, 400);
  if (!dealer) return jsonError("No dealer or distributor workspace is linked to this account.", 403);

  const { data: orders, error } = await supabase
    .from("orders")
    .select("*, dealer_profiles(*), order_items(*)")
    .eq("dealer_id", dealer.user_id)
    .order("created_at", { ascending: false });

  if (error) return jsonError(error.message, 400);

  return NextResponse.json(
    { role: "dealer", orders: orders ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const context = await getRequestContext(request);
  if ("error" in context) return context.error;

  const { supabase, user } = context;

  let body: {
    items?: OrderItemInput[];
    delivery_address?: string;
    dealer_note?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  const items = body.items;
  const deliveryAddress = typeof body.delivery_address === "string"
    ? body.delivery_address.trim()
    : "";
  const dealerNote = typeof body.dealer_note === "string"
    ? body.dealer_note.trim()
    : null;

  if (!Array.isArray(items) || items.length < 1 || items.length > 100) {
    return jsonError("Add between 1 and 100 order items.", 400);
  }
  if (!deliveryAddress || deliveryAddress.length > 1000) {
    return jsonError("A valid delivery address is required.", 400);
  }
  if (dealerNote && dealerNote.length > 1000) {
    return jsonError("Dealer note is too long.", 400);
  }

  const normalizedItems: OrderItemInput[] = [];
  const seenProductIds = new Set<string>();
  for (const item of items) {
    if (
      !item ||
      typeof item.product_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.product_id) ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 10000
    ) {
      return jsonError("An order item has an invalid product ID or quantity.", 400);
    }
    if (seenProductIds.has(item.product_id)) {
      return jsonError("Each product must appear only once in the order.", 400);
    }
    seenProductIds.add(item.product_id);
    normalizedItems.push({
      product_id: item.product_id,
      quantity: item.quantity,
    });
  }

  // Never accept distributor_id or dealer_id from the request body.
  const { data: dealer, error: dealerError } = await supabase
    .from("dealer_profiles")
    .select("user_id, distributor_id, review_status, address, city, pin_code")
    .eq("user_id", user.id)
    .maybeSingle();

  if (dealerError) return jsonError(dealerError.message, 400);
  if (!dealer || !dealer.distributor_id) {
    return jsonError("Your dealer account is not assigned to a distributor.", 403);
  }
  if (dealer.review_status !== "approved") {
    return jsonError("Your dealer account must be approved before ordering.", 403);
  }

  // The database function re-derives auth.uid(), validates product ownership,
  // locks stock rows, calculates prices, reserves stock and writes order items
  // in one transaction. It never trusts a distributor ID supplied by the browser.
  const { data: orderId, error: orderError } = await supabase.rpc(
    "place_wholesale_order",
    {
      p_items: normalizedItems,
      p_delivery_address: deliveryAddress,
      p_dealer_note: dealerNote,
    },
  );

  if (orderError) return jsonError(orderError.message, 400);

  return NextResponse.json(
    { success: true, order_id: orderId },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
