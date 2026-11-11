"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronRight, Package, ShoppingCart } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type ProductVariantOption = {
  colorName?: string | null;
  colorHex?: string | null;
  capacityLiters?: string | number | null;
};

type ProductRow = {
  id: string;
  category_id: string | null;
  sku: string;
  name: string;
  brand: string | null;
  description: string | null;
  image_path: string | null;
  image_paths: string[] | null;
  product_type: string | null;
  color_name: string | null;
  capacity_liters: number | null;
  variants: ProductVariantOption[] | null;
  unit_label: string;
  pieces_per_unit: number;
  minimum_order_quantity: number;
  price: number | string;
  stock_on_hand: number;
  stock_reserved: number;
};

type Product = {
  id: string;
  name: string;
  brand: string;
  description: string;
  category: string;
  sku: string;
  imagePaths: string[];
  productType: string;
  colorName: string;
  capacityLiters: number | null;
  variants: ProductVariantOption[];
  unit: string;
  piecesPerUnit: number;
  minimumOrder: number;
  price: number;
  stock: number;
};

type CategoryRow = { id: string; name: string };

const money = (value: number) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
}).format(value);

const colourHex: Record<string, string> = {
  red: "#e53935", crimson: "#b71c1c", maroon: "#800000", blue: "#2563eb",
  navy: "#172554", sky: "#38bdf8", green: "#16a34a", olive: "#808000",
  yellow: "#facc15", gold: "#d4af37", orange: "#f97316", pink: "#ec4899",
  purple: "#8b5cf6", violet: "#7c3aed", black: "#171717", white: "#f8fafc",
  silver: "#c0c0c0", grey: "#9ca3af", gray: "#9ca3af", brown: "#8b5e3c",
  beige: "#d6c4a1", cream: "#fffdd0", copper: "#b87333", teal: "#0d9488",
};

function swatch(name: string, hex?: string | null) {
  if (hex && /^#[0-9a-f]{6}$/i.test(hex)) return hex;
  return colourHex[name.trim().toLowerCase()] || "#a3a3a3";
}

function familyKey(sku: string) {
  return sku.match(/^(.+?)-(\d{2,})$/)?.[1] || sku;
}

export default function ProductDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const productId = String(params.id || "");
  const [products, setProducts] = useState<Product[]>([]);
  const [role, setRole] = useState<"dealer" | "distributor" | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      setProducts([]);
      setRole(null);
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setError("The product catalogue is not connected. Please try again later.");
        setLoading(false);
        return;
      }
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session?.user) {
          router.replace("/");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles").select("role").eq("id", session.user.id).single();
        if (profileError) throw profileError;
        if (profile?.role !== "dealer" && profile?.role !== "distributor") {
          throw new Error("Your workspace access could not be verified.");
        }

        // RLS scopes these active products to the signed-in dealer/distributor.
        const [{ data: categoryRows, error: categoryError }, { data: productRows, error: productError }] = await Promise.all([
          supabase.from("categories").select("id,name"),
          supabase.from("products")
            .select("id,category_id,sku,name,brand,description,image_path,image_paths,product_type,color_name,capacity_liters,variants,unit_label,pieces_per_unit,minimum_order_quantity,price,stock_on_hand,stock_reserved")
            .eq("is_active", true),
        ]);
        if (categoryError) throw categoryError;
        if (productError) throw productError;
        const names = new Map(((categoryRows || []) as CategoryRow[]).map(row => [row.id, row.name]));
        const palette = ["sage", "blue", "coral", "sand", "mint", "plum", "gold", "orange"];
        const mapped = ((productRows || []) as ProductRow[]).map((row, index): Product => ({
          id: row.id,
          name: row.name,
          brand: row.brand || "",
          description: row.description || "",
          category: (row.category_id && names.get(row.category_id)) || "Uncategorised",
          sku: row.sku,
          imagePaths: row.image_paths?.length ? row.image_paths : row.image_path ? [row.image_path] : [],
          productType: row.product_type || "non_color",
          colorName: row.color_name || "",
          capacityLiters: row.capacity_liters,
          variants: row.variants || [],
          unit: row.unit_label,
          piecesPerUnit: row.pieces_per_unit,
          minimumOrder: row.minimum_order_quantity,
          price: Number(row.price),
          stock: Math.max(0, Number(row.stock_on_hand) - Number(row.stock_reserved || 0)),
        }));
        const selected = mapped.find(product => product.id === productId);
        if (!selected) throw new Error("This product is unavailable or you do not have permission to view it.");
        const group = mapped
          .filter(product => familyKey(product.sku) === familyKey(selected.sku))
          .sort((a, b) => Number(a.sku.match(/-(\d+)$/)?.[1] || 0) - Number(b.sku.match(/-(\d+)$/)?.[1] || 0));
        if (!active) return;
        setRole(profile.role);
        setProducts(group);
        setQuantity(Math.max(1, selected.minimumOrder));
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load this product.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [productId, router]);

  const product = products.find(item => item.id === productId) || products[0] || null;
  const colourOptions = useMemo(() => {
    const seen = new Set<string>();
    return products.filter(item => {
      const key = item.colorName.trim().toLowerCase();
      if (item.productType !== "color" || !key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [products]);

  useEffect(() => { setSelectedPhoto(0); }, [productId]);

  const selectVariant = (item: Product) => {
    if (item.id !== productId) router.push(`/products/${encodeURIComponent(item.id)}`);
  };

  const addToCart = () => {
    if (!product || role !== "dealer" || product.stock < product.minimumOrder) return;
    const safeQuantity = Math.min(product.stock, Math.max(product.minimumOrder, Math.floor(quantity)));
    window.location.assign(`/?addProduct=${encodeURIComponent(product.id)}&quantity=${safeQuantity}`);
  };

  return (
    <main className="product-page-shell">
      <div className="product-page-topbar">
        <Link href="/" className="product-page-back"><ArrowLeft size={17}/> Back to workspace</Link>
        <span className="product-page-brandmark">supplydesk<span>.</span></span>
      </div>

      {loading ? (
        <section className="product-page-state"><Package size={30}/><h1>Loading product</h1><p>Checking product information and available variants.</p></section>
      ) : error ? (
        <section className="product-page-state"><Package size={30}/><h1>Product unavailable</h1><p>{error}</p><Link href="/" className="btn btn-primary">Return to workspace</Link></section>
      ) : product ? (
        <>
          <div className="product-page-breadcrumb"><Link href="/">Workspace</Link><ChevronRight size={14}/><span>{product.category}</span><ChevronRight size={14}/><strong>{product.name}</strong></div>
          <section className="product-page-card">
            <div className="product-detail-content product-page-content">
              <div className="product-detail-gallery">
                <div className="product-detail-main-image">
                  {product.imagePaths.length
                    ? <img src={product.imagePaths[selectedPhoto] || product.imagePaths[0]} alt={product.name}/>
                    : <span><Package size={68}/></span>}
                </div>
                {product.imagePaths.length > 1 && (
                  <div className="product-detail-thumbnails">
                    {product.imagePaths.map((src, index) => (
                      <button key={src + index} type="button" className={selectedPhoto === index ? "active" : ""} onClick={() => setSelectedPhoto(index)}>
                        <img src={src} alt={`${product.name} view ${index + 1}`}/>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="product-detail-information">
                <div className="product-page-category">{product.category}</div>
                <div className="product-detail-brand">{product.brand || "Brand not specified"}</div>
                <h1 className="product-page-title">{product.name}</h1>
                <div className="product-detail-rating"><span className="product-detail-stock-dot" style={{background: product.stock > 0 ? "#4a9a61" : "#c56d5d"}}/>{product.stock > 0 ? `${product.stock} ${product.unit}s available` : "Currently out of stock"}</div>
                <div className="product-detail-price">{money(product.price)} <small>per {product.unit.toLowerCase()}</small></div>
                <p className="product-detail-description">{product.description.trim() || "No product description has been added yet."}</p>

                {colourOptions.length > 0 && (
                  <div className="product-detail-option">
                    <strong>Colour</strong>
                    <div className="product-detail-swatches">
                      {colourOptions.map(option => (
                        <button key={option.id} type="button" className={product.colorName.toLowerCase() === option.colorName.toLowerCase() ? "selected" : ""} onClick={() => selectVariant(option)}>
                          <span style={{backgroundColor: swatch(option.colorName, option.variants.find(item => item.colorName?.trim().toLowerCase() === option.colorName.toLowerCase())?.colorHex)}}/>{option.colorName}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {products.length > 1 && (
                  <label className="product-detail-option">
                    <strong>Size / capacity / variant</strong>
                    <select value={product.id} onChange={event => {
                      const option = products.find(item => item.id === event.target.value);
                      if (option) selectVariant(option);
                    }}>
                      {products.map(option => {
                        const capacity = option.capacityLiters ?? option.name.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*L$/i)?.[1];
                        return <option key={option.id} value={option.id}>{capacity ? `${capacity} L` : option.sku}{option.colorName ? ` · ${option.colorName}` : ""} · {money(option.price)} · {option.stock} in stock</option>;
                      })}
                    </select>
                  </label>
                )}

                {product.variants.length > 0 && (
                  <div className="product-detail-option">
                    <strong>Variant details</strong>
                    <div className="product-page-variant-tags">
                      {product.variants.map((variant, index) => (
                        <span key={index}>{[variant.colorName, variant.capacityLiters ? `${variant.capacityLiters} L` : ""].filter(Boolean).join(" · ") || "Standard variant"}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="product-detail-specs">
                  <div><span>Brand / company</span><strong>{product.brand || "Not specified"}</strong></div>
                  <div><span>SKU</span><strong>{product.sku}</strong></div>
                  <div><span>Category</span><strong>{product.category}</strong></div>
                  <div><span>Pack size</span><strong>{product.piecesPerUnit} {product.piecesPerUnit === 1 ? "piece" : "pieces"} per {product.unit}</strong></div>
                  <div><span>Minimum order</span><strong>{product.minimumOrder} {product.unit}{product.minimumOrder === 1 ? "" : "s"}</strong></div>
                  <div><span>Stock status</span><strong>{product.stock > 0 ? "Available" : "Out of stock"}</strong></div>
                </div>

                {role === "dealer" ? (
                  <div className="product-page-buy">
                    <label>Quantity ({product.unit})
                      <input type="number" min={product.minimumOrder} max={product.stock} step={product.minimumOrder} value={quantity} onChange={event => setQuantity(Number(event.target.value))}/>
                    </label>
                    <button className="btn btn-primary" type="button" disabled={product.stock < product.minimumOrder || quantity < product.minimumOrder || quantity > product.stock} onClick={addToCart}><ShoppingCart size={17}/> Add to cart</button>
                  </div>
                ) : (
                  <div className="product-page-distributor-note">Distributor view · Manage this item from Products & Stock in your workspace.</div>
                )}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
