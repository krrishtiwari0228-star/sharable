import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

function imageError(message: string, status: number) {
  return Response.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("url");
  if (!source) return imageError("Product photo URL is required.", 400);

  let imageUrl: URL;
  try {
    imageUrl = new URL(source);
  } catch {
    return imageError("Product photo URL is invalid.", 400);
  }

  let supabaseOrigin = "";
  try {
    supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
      : "";
  } catch {
    // An invalid Supabase URL simply disables the Supabase image source below.
  }

  const isProductStorageImage =
    imageUrl.protocol === "https:" &&
    imageUrl.origin === supabaseOrigin &&
    imageUrl.pathname.startsWith("/storage/v1/object/public/product-images/");
  const isCatalogImage =
    imageUrl.protocol === "https:" &&
    imageUrl.hostname === "5.imimg.com" &&
    imageUrl.pathname.startsWith("/data5/SELLER/");

  if (!isProductStorageImage && !isCatalogImage) {
    return imageError("This product photo source is not supported.", 400);
  }

  try {
    const upstream = await fetch(imageUrl, {
      headers: { Accept: "image/jpeg,image/png,image/webp" },
      cache: "force-cache",
      signal: AbortSignal.timeout(12_000),
    });
    if (!upstream.ok) return imageError("Could not load the saved product photo.", 502);

    const contentType = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (!contentType || !["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
      return imageError("The saved product photo is not a supported image.", 415);
    }

    const contentLength = Number(upstream.headers.get("content-length") || 0);
    if (contentLength > MAX_IMAGE_BYTES) return imageError("The saved product photo is too large to process.", 413);

    const image = await upstream.arrayBuffer();
    if (image.byteLength > MAX_IMAGE_BYTES) return imageError("The saved product photo is too large to process.", 413);

    return new Response(image, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return imageError("Could not fetch the saved product photo. Try again shortly.", 502);
  }
}
