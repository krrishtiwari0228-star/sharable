"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Bell, Search, ShoppingCart, Package, LayoutDashboard, ClipboardList, Boxes, Users, FileSpreadsheet, Settings, Copy, Plus, Minus, Check, Truck, ChevronRight, Menu, X, CircleUserRound, ArrowUpRight, CheckCircle2, AlertTriangle, Sparkles, Images, Building2, ShieldCheck, Store as StoreIcon, Sun, Moon } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Product = { id: string | number; name: string; category: string; brand: string; sku: string; unit: string; piecesPerCarton: number; minOrder: number; price: number; stock: number; color: string; mark: string; imagePath?: string; imagePaths?: string[]; productType?: string; colorName?: string; capacityLiters?: number | null; variants?: ProductVariantDraft[]; isActive?: boolean; reservedStock?: number };
type ProductVariantDraft = { colorName: string | null; colorHex: string | null; capacityLiters: string | number | null };
const COLOR_SWATCHES: Record<string,string> = { red:"#e53935", crimson:"#b71c1c", maroon:"#800000", blue:"#2563eb", navy:"#172554", sky:"#38bdf8", green:"#16a34a", olive:"#808000", yellow:"#facc15", gold:"#d4af37", orange:"#f97316", pink:"#ec4899", purple:"#8b5cf6", violet:"#7c3aed", black:"#171717", white:"#f8fafc", silver:"#c0c0c0", grey:"#9ca3af", gray:"#9ca3af", brown:"#8b5e3c", beige:"#d6c4a1", cream:"#fffdd0", copper:"#b87333", teal:"#0d9488" };
function getColorSwatch(name:string, hex?:string | null):string { if(hex && /^#[0-9a-f]{6}$/i.test(hex)) return hex; const key=name.trim().toLowerCase(); return COLOR_SWATCHES[key] || (key.startsWith("#") && /^#[0-9a-f]{6}$/i.test(key) ? key : "#a3a3a3"); }
const COLOR_OPTIONS = Object.entries(COLOR_SWATCHES).filter(([name]) => name !== "gray");
type ProductDraft = { name: string; sku: string; brand: string; category: string; unit: string; piecesPerUnit: string; minimumOrderQuantity: string; price: string; stock: string; imageUrl: string; imageFile: File | null; imagePreview: string; imageFiles: File[]; imagePreviews: string[]; productType: "color" | "non_color"; colorName: string; capacityLiters: string; variants: ProductVariantDraft[] };
type CartLine = { product: Product; qty: number };
type WholesaleOrder = { id: string; orderNumber: string; dealer: string; area: string; items: number; pieces: number; products: string[]; cancelReason: string; amount: number; status: string; time: string };
type DealerProfile = { user_id: string; store_name: string; contact_name: string; address: string; city: string; review_status: "pending" | "approved" | "rejected" | "suspended"; created_at: string };
type CategoryRow = { id: string; name: string };
type ProductRow = { id: string; category_id: string | null; sku: string; name: string; brand: string | null; image_path: string | null; image_paths: string[] | null; product_type: string; color_name: string | null; capacity_liters: number | null; variants: ProductVariantDraft[] | null; unit_label: string; pieces_per_unit: number; minimum_order_quantity: number; price: number | string; stock_on_hand: number; stock_reserved: number; is_active: boolean };
type OrderItemRow = { quantity: number; pieces_per_unit_snapshot: number; product_name_snapshot: string; unit_label_snapshot: string };
type DealerOrderSummary = { store_name: string | null; city: string | null };
type OrderRow = { id: string; order_number: number | string; dealer_profiles: DealerOrderSummary | DealerOrderSummary[] | null; order_items: OrderItemRow[] | null; status: string; delivery_address: string | null; cancellation_reason: string | null; grand_total: number | string | null; created_at: string };
type OrdersPayload = { orders?: OrderRow[]; error?: string };
const money = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
const MAX_PRODUCT_IMAGE_BYTES = 8 * 1024 * 1024;

async function encodeProductImage(file: File): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a JPG, PNG or WebP image.");
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("Choose an image smaller than 20 MB.");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This image could not be prepared for upload.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const outputType = file.type === "image/jpeg" ? "image/jpeg" : "image/webp";

    for (const quality of [0.86, 0.72, 0.58]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outputType, quality));
      if (!blob) throw new Error("This image could not be prepared for upload.");
      if (blob.size <= MAX_PRODUCT_IMAGE_BYTES) return blob;
    }
    throw new Error("This image is still too large after compression. Choose a smaller image.");
  } finally {
    bitmap.close();
  }
}


let backgroundRemovalRuntime: ReturnType<typeof loadBackgroundRemovalRuntime> | null = null;

async function loadBackgroundRemovalRuntime(preferWebGpu = true) {
  const { AutoModel, AutoProcessor, RawImage } = await import("@huggingface/transformers");
  const browserNavigator = navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } };
  const adapter = preferWebGpu ? await browserNavigator.gpu?.requestAdapter() : null;
  const modelId = "onnx-community/BiRefNet_lite-ONNX";
  let model;
  let device: "webgpu" | "wasm" = "wasm";
  if (adapter) {
    try {
      model = await AutoModel.from_pretrained(modelId, { dtype: "fp16", device: "webgpu" });
      device = "webgpu";
    } catch (webGpuError) {
      console.warn("Product photo model could not start on WebGPU; retrying on the CPU runtime.", webGpuError);
    }
  }
  // Some integrated GPUs cannot allocate the model's large weight buffers. The
  // same model runs on the CPU runtime, so background removal still works there.
  model ??= await AutoModel.from_pretrained(modelId, { dtype: "fp32", device: "wasm" });
  const processor = await AutoProcessor.from_pretrained(modelId);
  return { model, processor, RawImage, device };
}

type BackgroundRemovalRuntime = Awaited<ReturnType<typeof loadBackgroundRemovalRuntime>>;

async function inferProductMask(
  image: Parameters<BackgroundRemovalRuntime["processor"]>[0],
  runtime: BackgroundRemovalRuntime,
) {
  const { pixel_values } = await runtime.processor(image);
  const { output_image } = await runtime.model({ input_image: pixel_values });
  return runtime.RawImage.fromTensor(
    output_image[0].sigmoid().mul(255).to("uint8"),
  ).resize(image.width, image.height);
}

async function removeProductImageBackground(source: Blob): Promise<Blob> {
  let runtime = await (backgroundRemovalRuntime ??= loadBackgroundRemovalRuntime());
  const image = await runtime.RawImage.fromBlob(source);
  let mask;
  try {
    mask = await inferProductMask(image, runtime);
  } catch (webGpuError) {
    if (runtime.device !== "webgpu") throw webGpuError;
    console.warn("Product photo inference failed on WebGPU; retrying on the CPU runtime.", webGpuError);
    backgroundRemovalRuntime = loadBackgroundRemovalRuntime(false);
    runtime = await backgroundRemovalRuntime;
    mask = await inferProductMask(image, runtime);
  }
  const cutout = image.clone().rgba().putAlpha(mask);
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = cutout.width;
  sourceCanvas.height = cutout.height;
  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext) throw new Error("This background-removed image could not be prepared.");
  sourceContext.putImageData(
    new ImageData(new Uint8ClampedArray(cutout.data), cutout.width, cutout.height),
    0,
    0,
  );
  let minX = cutout.width;
  let minY = cutout.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < cutout.height; y++) {
    for (let x = 0; x < cutout.width; x++) {
      if (cutout.data[(y * cutout.width + x) * 4 + 3] <= 32) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) throw new Error("No product was detected in this photo.");
  const padding = Math.round(Math.max(maxX - minX + 1, maxY - minY + 1) * 0.06);
  const cropX = Math.max(0, minX - padding);
  const cropY = Math.max(0, minY - padding);
  const cropRight = Math.min(cutout.width, maxX + padding + 1);
  const cropBottom = Math.min(cutout.height, maxY + padding + 1);
  const canvas = document.createElement("canvas");
  canvas.width = cropRight - cropX;
  canvas.height = cropBottom - cropY;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This background-removed image could not be prepared.");
  context.drawImage(
    sourceCanvas,
    cropX,
    cropY,
    canvas.width,
    canvas.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("This image could not be saved with transparency.")),
      "image/webp",
      0.94,
    );
  });
}

async function fitProductCutoutToCanvas(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    const boundsCanvas = document.createElement("canvas");
    boundsCanvas.width = bitmap.width;
    boundsCanvas.height = bitmap.height;
    const boundsContext = boundsCanvas.getContext("2d", { willReadFrequently: true });
    if (!boundsContext) throw new Error("This product image could not be fitted to the canvas.");
    boundsContext.drawImage(bitmap, 0, 0);
    const pixels = boundsContext.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let minX = bitmap.width, minY = bitmap.height, maxX = -1, maxY = -1;
    for (let y = 0; y < bitmap.height; y++) {
      for (let x = 0; x < bitmap.width; x++) {
        if (pixels[(y * bitmap.width + x) * 4 + 3] < 24) continue;
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
    if (maxX < minX || maxY < minY) throw new Error("No product was detected in the prepared image.");
    const padding = Math.round(Math.max(maxX - minX + 1, maxY - minY + 1) * 0.045);
    const cropX = Math.max(0, minX - padding), cropY = Math.max(0, minY - padding);
    const cropWidth = Math.min(bitmap.width, maxX + padding + 1) - cropX;
    const cropHeight = Math.min(bitmap.height, maxY + padding + 1) - cropY;
    const canvas = document.createElement("canvas");
    canvas.width = 1024; canvas.height = 1024;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This product image could not be fitted to the canvas.");
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
    const margin = 64;
    const scale = Math.min((canvas.width - margin * 2) / cropWidth, (canvas.height - margin * 2) / cropHeight);
    const drawWidth = cropWidth * scale, drawHeight = cropHeight * scale;
    context.drawImage(bitmap, cropX, cropY, cropWidth, cropHeight, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
    const output = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!output) throw new Error("The fitted product image could not be exported as JPEG.");
    return output;
  } finally { bitmap.close(); }
}

export default function Home() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const savedTheme = window.localStorage.getItem("supplydesk-theme");
    const initialTheme = savedTheme === "dark" ? "dark" : "light";
    setTheme(initialTheme);
    document.documentElement.dataset.theme = initialTheme;
  }, []);
  const toggleTheme = () => setTheme(current => {
    const nextTheme = current === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("supplydesk-theme", nextTheme);
    return nextTheme;
  });
  const [role, setRole] = useState<"distributor" | "dealer">("distributor");
  const [signedIn, setSignedIn] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [loginRole, setLoginRole] = useState<"distributor" | "dealer">("dealer");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginShop, setLoginShop] = useState("");
  const [loginError, setLoginError] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [resetMode, setResetMode] = useState(false);
  const recoveryEventRef = useRef(false);
  const [newPassword, setNewPassword] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupBusiness, setSignupBusiness] = useState("");
  const [signupAddress, setSignupAddress] = useState("");
  const [signupCity, setSignupCity] = useState("Pune");
  const [signupPhone, setSignupPhone] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [page, setPage] = useState("Overview");
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productError, setProductError] = useState("");
  const [catalogueRefreshKey, setCatalogueRefreshKey] = useState(0);
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0);
  const ordersLoadedRef = useRef(false);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [productSaving, setProductSaving] = useState(false);
  const [backgroundRemoving, setBackgroundRemoving] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | number | null>(null);
  const emptyProductDraft: ProductDraft = { name: "", sku: "", brand: "", category: "", unit: "carton", piecesPerUnit: "1", minimumOrderQuantity: "1", price: "", stock: "0", imageUrl: "", imageFile: null, imagePreview: "", imageFiles: [], imagePreviews: [], productType: "non_color", colorName: "", capacityLiters: "", variants: [{colorName:"",colorHex:"#e53935",capacityLiters:""}] };
  const [productDraft, setProductDraft] = useState<ProductDraft>(emptyProductDraft);
  const productImageInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => {
    if (productDraft.imagePreview.startsWith("blob:")) URL.revokeObjectURL(productDraft.imagePreview);
  }, [productDraft.imagePreview]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All products");
  const [orders, setOrders] = useState<WholesaleOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [orderBusy, setOrderBusy] = useState(false);
  const [dealers, setDealers] = useState<DealerProfile[]>([]);
  const [dealersLoading, setDealersLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [dealerName, setDealerName] = useState("");
  const [reviewStatus, setReviewStatus] = useState<"pending" | "approved" | "rejected" | "suspended">("pending");
  // Admin sign-in is kept off the dealer-facing screen. The distributor can open
  // /?workspace=admin directly; authorization still depends on Supabase credentials and role.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("workspace") === "admin") setLoginRole("distributor");
    const supabase = getSupabaseBrowserClient();
    const authSubscription = supabase?.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        recoveryEventRef.current = true;
        setResetMode(true);
        setAuthMode("login");
        setSignedIn(false);
      }
    });
    if (window.location.hash.includes("type=recovery")) {
      recoveryEventRef.current = true;
      setResetMode(true);
      setAuthMode("login");
    }
    return () => authSubscription?.data.subscription.unsubscribe();
  }, []);
  // Restore the verified Supabase session; never trust a role stored in browser storage.
  useEffect(() => {
    let active = true;
    const restore = async () => {
      try {
        // Recovery links intentionally open the password form; do not route into the workspace first.
        if (recoveryEventRef.current || window.location.hash.includes("type=recovery")) return;
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          const { data: { session } } = await supabase.auth.getSession();
          if (recoveryEventRef.current) return;
          if (session?.user && active) {
            // Repair this user's dealer profile if an earlier signup was incomplete.
            // The database function can only create the least-privileged dealer role.
            const { error: repairError } = await supabase.rpc("ensure_my_account_profile");
            if (repairError) console.warn("Account profile recovery was unavailable", repairError.message);
            const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
            if (profile?.role === "distributor" && active) {
              setRole("distributor"); setPage("Overview"); setSignedIn(true);
            } else if (profile?.role === "dealer" && active) {
              const { data: dealer } = await supabase.from("dealer_profiles").select("store_name,review_status").eq("user_id", session.user.id).single();
              setRole("dealer");
              setDealerName(dealer?.store_name || "Your shop");
              setLoginShop(dealer?.store_name || "");
              setReviewStatus(dealer?.review_status || "pending");
              setPage("Product Catalogue");
              setSignedIn(true);
            } else if (active) {
              setLoginError("Your account is signed in, but its workspace profile could not be loaded. Try again; do not create a second account.");
            }
          }
        }
        window.localStorage.removeItem("supplydesk-demo-orders");
        window.localStorage.removeItem("supplydesk-demo-cart");
      } catch (error) {
        console.error("Could not restore SupplyDesk data", error);
      } finally {
        if (active) setAuthReady(true);
      }
    };
    void restore();
    return () => { active = false; };
  }, []);
  // Orders and cart are no longer persisted as browser demo data.

  const cartCount = cart.reduce((n, line) => n + line.qty, 0);
  const cartTotal = cart.reduce((n, line) => n + line.qty * line.product.price, 0);
  const productCategories = useMemo(() => ["All products", ...Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort((a,b)=>a.localeCompare(b))], [products]);
  const filtered = useMemo(() => {
    const eligible = products.filter(p => category === "All products" || p.category === category);
    const query = search.toLowerCase().trim();
    if (!query) return eligible;
    const matchingGroups = new Set(eligible.filter(p => `${p.name} ${p.sku} ${p.category} ${p.brand}`.toLowerCase().includes(query)).map(p => p.sku.match(/^(.+?)-(\\d{2,})$/)?.[1] || p.sku));
    return eligible.filter(p => matchingGroups.has(p.sku.match(/^(.+?)-(\\d{2,})$/)?.[1] || p.sku));
  }, [products, category, search]);
  const [selectedVariantByGroup, setSelectedVariantByGroup] = useState<Record<string, string>>({});
  const [selectedPhotoByProduct, setSelectedPhotoByProduct] = useState<Record<string, number>>({});
  const groupedFiltered = useMemo(() => {
    const groups = new Map<string, Product[]>();
    for (const product of filtered) {
      const match = product.sku.match(/^(.+?)-(\d{2,})$/);
      const groupKey = match ? match[1] : product.sku;
      groups.set(groupKey, [...(groups.get(groupKey) || []), product]);
    }
    return Array.from(groups, ([groupKey, variants]) => ({ groupKey, variants: variants.sort((a, b) => (Number(a.sku.match(/-(\d+)$/)?.[1] || 0) - Number(b.sku.match(/-(\d+)$/)?.[1] || 0))) }));
  }, [filtered]);

  // Refresh the live catalogue whenever the app becomes visible again (e.g. returning to the tab).
  useEffect(() => {
    if (!signedIn) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") setCatalogueRefreshKey(value => value + 1);
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn || role !== "distributor") return;
    let active = true;
    const loadDealers = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      setDealersLoading(true);
      const { data, error } = await supabase.from("dealer_profiles").select("user_id,store_name,contact_name,address,city,review_status,created_at").order("created_at", { ascending: false });
      if (active) {
        if (error) flash(error.message);
        else setDealers((data || []) as DealerProfile[]);
        setDealersLoading(false);
      }
    };
    void loadDealers();
    return () => { active = false; };
  }, [signedIn, role, catalogueRefreshKey]);

  const reviewDealer = async (userId: string, reviewStatus: "approved" | "rejected") => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.from("dealer_profiles").update({
      review_status: reviewStatus, reviewed_at: new Date().toISOString()
    }).eq("user_id", userId);
    if (error) { flash(error.message); return; }
    setCatalogueRefreshKey(value => value + 1);
    flash(reviewStatus === "approved" ? "Dealer approved. They can now place orders." : "Dealer rejected.");
  };

  // Load real orders and item snapshots; database RLS scopes them to the signed-in workspace.
  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    const loadOrders = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      if (!ordersLoadedRef.current) setOrdersLoading(true);
      setOrderError("");
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session?.access_token) throw new Error("Your session expired. Sign in again.");
        const response = await fetch("/api/orders", {
          method: "GET",
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store"
        });
        const payload = (await response.json()) as OrdersPayload;
        if (!response.ok) throw new Error(payload.error || "Could not load orders.");
        if (!active) return;
        setOrders((payload.orders || []).map((o) => {
          const dealerValue = o.dealer_profiles;
          const dealer = Array.isArray(dealerValue) ? dealerValue[0] : dealerValue;
          const items = o.order_items || [];
          const status = String(o.status || "pending").replaceAll("_", " ").replace(/\b\w/g, (m: string) => m.toUpperCase());
          return {
            id: o.id, orderNumber: `ORD-${o.order_number}`,
            dealer: dealer?.store_name || "Dealer",
            area: [o.delivery_address, dealer?.city].filter(Boolean).join(", "),
            items: items.length,
            pieces: items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.pieces_per_unit_snapshot || 1), 0),
            products: items.map((item) => `${item.product_name_snapshot} × ${item.quantity} ${item.unit_label_snapshot}`),
            cancelReason: o.cancellation_reason || "", amount: Number(o.grand_total || 0), status,
            time: new Date(o.created_at).toLocaleString("en-IN")
          };
        }));
        ordersLoadedRef.current = true;
      } catch (error) {
        if (active) setOrderError(error instanceof Error ? error.message : "Could not load orders from the database.");
      } finally { if (active) setOrdersLoading(false); }
    };
    void loadOrders();
    return () => { active = false; };
  }, [signedIn, role, ordersRefreshKey]);

  // Load only rows visible to the authenticated user's RLS policies.
  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    const loadProducts = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      setProductsLoading(true);
      setProductError("");
      try {
        const [{ data: categoryRows, error: categoryLoadError }, { data: productRows, error: productLoadError }] = await Promise.all([
          supabase.from("categories").select("id,name"),
          supabase.from("products").select("id,category_id,sku,name,brand,description,image_path,image_paths,product_type,color_name,capacity_liters,variants,unit_label,pieces_per_unit,minimum_order_quantity,price,stock_on_hand,stock_reserved,is_active").eq("is_active", true)
        ]);
        if (categoryLoadError) throw categoryLoadError;
        if (productLoadError) throw productLoadError;
        if (!active) return;
        const names = new Map(((categoryRows || []) as CategoryRow[]).map((row) => [row.id, row.name]));
        const palette = ["sage", "blue", "coral", "sand", "mint", "plum", "gold", "orange"];
        setProducts(((productRows || []) as ProductRow[]).map((row, index) => ({
          id: row.id,
          name: row.name,
          category: (row.category_id && names.get(row.category_id)) || "Uncategorised",
          brand: row.brand || "",
          sku: row.sku,
          unit: row.unit_label,
          piecesPerCarton: row.pieces_per_unit,
          minOrder: row.minimum_order_quantity,
          price: Number(row.price),
          stock: Number(row.stock_on_hand) - Number(row.stock_reserved || 0),
          reservedStock: Number(row.stock_reserved || 0),
          color: palette[index % palette.length],
          mark: "◉",
          imagePath: row.image_path || "", imagePaths: row.image_paths?.length ? row.image_paths : row.image_path ? [row.image_path] : [], productType: row.product_type || "non_color", colorName: row.color_name || "", capacityLiters: row.capacity_liters, variants: row.variants || [],
          isActive: row.is_active
        })));
      } catch (error) {
        if (active) setProductError(error instanceof Error ? error.message : "Could not load products from the database.");
      } finally {
        if (active) setProductsLoading(false);
      }
    };
    void loadProducts();
    return () => { active = false; };
  }, [signedIn, role, catalogueRefreshKey]);
  const startNewProduct = () => {
    setEditingProductId(null);
    setProductDraft(emptyProductDraft);
    setProductError("");
    setProductFormOpen(true);
  };
  const startEditProduct = (product: Product) => {
    setEditingProductId(product.id);
    setProductDraft({
      name: product.name,
      sku: product.sku,
      brand: product.brand,
      category: product.category === "Uncategorised" ? "" : product.category,
      unit: product.unit,
      piecesPerUnit: String(product.piecesPerCarton),
      minimumOrderQuantity: String(product.minOrder),
      price: String(product.price),
      stock: String(product.stock),
      imageUrl: product.imagePath || "",
      imageFile: null,
      imagePreview: product.imagePath || "", imageFiles: [], imagePreviews: product.imagePaths?.length ? product.imagePaths : product.imagePath ? [product.imagePath] : [], productType: product.productType === "color" ? "color" : "non_color", colorName: product.colorName || "", capacityLiters: product.capacityLiters == null ? "" : String(product.capacityLiters), variants: product.variants?.length ? product.variants : [{colorName:product.colorName||"",colorHex:"#a3a3a3",capacityLiters:product.capacityLiters==null?"":String(product.capacityLiters)}]
    });
    setProductError("");
    setProductFormOpen(true);
  };
  const startDuplicateProduct = (product: Product) => {
    // Duplicate as a new draft, never overwrite the source product.
    startEditProduct(product);
    setEditingProductId(null);
    setProductDraft(current => ({
      ...current,
      name: `${product.name} (Copy)`,
      sku: `${product.sku}-COPY-${Date.now().toString().slice(-6)}`,
      stock: "0",
    }));
    setProductError("");
    setProductFormOpen(true);
  };

  const handleRemoveProductBackground = async () => {
    setProductError("");
    setBackgroundRemoving(true);
    let processingStage = "opening the saved product photo";
    try {
      let sourceFile = productDraft.imageFile;
      if (!sourceFile && productDraft.imageUrl) {
        const response = await fetch(`/api/product-image?url=${encodeURIComponent(productDraft.imageUrl)}`);
        if (!response.ok) throw new Error("Could not open the saved product photo. Choose it from your device and try again.");
        const sourceBlob = await response.blob();
        const extension = sourceBlob.type === "image/png" ? "png" : sourceBlob.type === "image/webp" ? "webp" : "jpg";
        sourceFile = new File([sourceBlob], `product-photo.${extension}`, { type: sourceBlob.type || "image/jpeg" });
      }
      if (!sourceFile) throw new Error("Choose a product photo first.");
      processingStage = "loading the background removal model";
      const transparentBlob = await removeProductImageBackground(sourceFile);
      const transparentFile = new File([transparentBlob], "product-cutout.webp", { type: transparentBlob.type || "image/webp" });
      setProductDraft((current) => ({
        ...current,
        imageUrl: "",
        imageFile: transparentFile,
        imagePreview: URL.createObjectURL(transparentFile),
      }));
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : error && typeof error === "object" && "message" in error
          ? String(error.message)
          : String(error || "Unknown error");
      console.error(`Product background removal failed while ${processingStage}.`, error);
      setProductError(`${processingStage}: ${message}`);
    } finally {
      setBackgroundRemoving(false);
    }
  };

  const saveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProductError("");
    if (role !== "distributor") {
      setProductError("Only the distributor administrator can manage products.");
      return;
    }
    const name = productDraft.name.trim();
    const sku = productDraft.sku.trim().toUpperCase();
    const brand = productDraft.brand.trim();
    const categoryName = productDraft.category.trim();
    const unit = productDraft.unit;
    const piecesPerUnit = Number(productDraft.piecesPerUnit);
    const minimumOrderQuantity = Number(productDraft.minimumOrderQuantity);
    const price = Number(productDraft.price);
    const stock = Number(productDraft.stock);
    if (!name || !sku || !categoryName) { setProductError("Enter product name, SKU and category."); return; }
    if (!["piece", "box", "carton", "set", "pack"].includes(unit)) { setProductError("Choose a valid selling unit."); return; }
    if (productDraft.productType === "color" && productDraft.variants.some(v => !String(v.colorName ?? "").trim())) { setProductError("Enter a color name for each color variant."); return; }
    if (productDraft.variants.some(v => String(v.capacityLiters ?? "").trim() && (!Number.isFinite(Number(v.capacityLiters)) || Number(v.capacityLiters) <= 0))) { setProductError("Enter a valid capacity for every variant."); return; }
    if (productDraft.capacityLiters.trim() && (!Number.isFinite(Number(productDraft.capacityLiters)) || Number(productDraft.capacityLiters) <= 0)) { setProductError("Enter a valid capacity in liters."); return; }
    if (!Number.isInteger(piecesPerUnit) || piecesPerUnit < 1 || !Number.isInteger(minimumOrderQuantity) || minimumOrderQuantity < 1 || !Number.isInteger(stock) || stock < 0 || !Number.isFinite(price) || price < 0) {
      setProductError("Check price, stock, pack size and minimum order values.");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setProductError("Supabase is not configured for this deployment."); return; }
    setProductSaving(true);
    const uploadedImagePaths: string[] = [];
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("Your session has expired. Sign in again.");
      const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (profileError) throw profileError;
      if (profile?.role !== "distributor") throw new Error("This account is not configured as the distributor administrator.");
      const { data: distributor, error: distributorError } = await supabase.from("distributors").select("id").eq("owner_id", user.id).eq("is_active", true).maybeSingle();
      if (distributorError) throw distributorError;
      if (!distributor?.id) throw new Error("Admin setup is incomplete: this account has no active distributor business yet. Complete the separate admin setup first.");
      let categoryId: string;
      const { data: existingCategory, error: categoryLookupError } = await supabase.from("categories").select("id").eq("distributor_id", distributor.id).ilike("name", categoryName).maybeSingle();
      if (categoryLookupError) throw categoryLookupError;
      if (existingCategory?.id) {
        categoryId = existingCategory.id;
      } else {
        const { data: newCategory, error: categoryInsertError } = await supabase.from("categories").insert({ distributor_id: distributor.id, name: categoryName }).select("id").single();
        if (categoryInsertError) throw categoryInsertError;
        categoryId = newCategory.id;
      }
      const currentEditingProduct = editingProductId === null ? undefined : products.find(p => p.id === editingProductId);
      const imagePaths = productDraft.imagePreviews.filter(path => !path.startsWith("blob:"));
      const filesToUpload = productDraft.imageFiles.length ? productDraft.imageFiles : productDraft.imageFile ? [productDraft.imageFile] : [];
      for (const file of filesToUpload) {
        const imageBlob = await encodeProductImage(file);
        const imageExtension = imageBlob.type === "image/png" ? "png" : imageBlob.type === "image/webp" ? "webp" : "jpg";
        const uploadedPath = distributor.id + "/products/" + crypto.randomUUID() + "." + imageExtension;
        const { error: imageUploadError } = await supabase.storage.from("product-images").upload(uploadedPath, imageBlob, { contentType: imageBlob.type, upsert: false });
        if (imageUploadError) throw new Error("Image upload failed: " + imageUploadError.message);
        uploadedImagePaths.push(uploadedPath);
        imagePaths.push(supabase.storage.from("product-images").getPublicUrl(uploadedPath).data.publicUrl);
      }
      const imagePath = imagePaths[0] || productDraft.imageUrl.trim() || null;
      const productPayload = {
        distributor_id: distributor.id,
        category_id: categoryId,
        sku,
        name,
        brand: brand || null,
        image_path: imagePath,
        image_paths: imagePaths,
        product_type: productDraft.productType,
        color_name: productDraft.productType === "color" ? productDraft.colorName.trim() || null : null,
        capacity_liters: productDraft.capacityLiters.trim() ? Number(productDraft.capacityLiters) : null,
        variants: productDraft.variants.map(v => ({colorName: productDraft.productType === "color" ? String(v.colorName ?? "").trim() : null, colorHex: productDraft.productType === "color" ? v.colorHex : null, capacityLiters: String(v.capacityLiters ?? "").trim() ? Number(v.capacityLiters) : null})),
        unit_label: unit,
        pieces_per_unit: piecesPerUnit,
        minimum_order_quantity: minimumOrderQuantity,
        price,
        stock_on_hand: stock + (currentEditingProduct?.reservedStock || 0),
        is_active: true
      };
      let savedId: string | number;
      if (editingProductId !== null) {
        const { data: saved, error } = await supabase.from("products").update(productPayload).eq("id", editingProductId).select("id").single();
        if (error) throw error;
        savedId = saved.id;
      } else {
        const { data: saved, error } = await supabase.from("products").insert(productPayload).select("id").single();
        if (error) throw error;
        savedId = saved.id;
      }
      uploadedImagePaths.length = 0;
      const savedProduct: Product = {
        id: savedId, name, category: categoryName, brand, sku, unit,
        piecesPerCarton: piecesPerUnit, minOrder: minimumOrderQuantity,
        price, stock, color: "sage", mark: "◉",
        imagePath: imagePath || "", imagePaths, productType: productDraft.productType, colorName: productDraft.colorName.trim(), capacityLiters: productDraft.capacityLiters.trim() ? Number(productDraft.capacityLiters) : null, variants: productDraft.variants, isActive: true,
        reservedStock: currentEditingProduct?.reservedStock || 0
      };
      setProducts(old => editingProductId === null ? [savedProduct, ...old] : old.map(p => p.id === editingProductId ? savedProduct : p));
      setCategory(categoryName);
      setProductDraft(emptyProductDraft);
      setProductFormOpen(false);
      setEditingProductId(null);
      flash(editingProductId === null ? "Product saved to the live catalogue." : "Product changes saved.");
    } catch (error) {
      if (uploadedImagePaths.length) {
        const { error: cleanupError } = await supabase.storage.from("product-images").remove(uploadedImagePaths);
        if (cleanupError) console.warn("Could not clean up failed product image uploads", cleanupError.message);
      }
      const message = error instanceof Error ? error.message : "Could not save the product.";
      setProductError(message.toLowerCase().includes("products_distributor_sku_key") || message.toLowerCase().includes("duplicate key")
        ? "That SKU already exists in your catalogue. Use a unique SKU for each product."
        : message);
    } finally {
      setProductSaving(false);
    }
  };
  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 3000); };
  const add = (product: Product, delta: number) => setCart(old => { const line = old.find(x => x.product.id === product.id); if (!line && delta > 0) return [...old, { product, qty: Math.min(Math.max(delta, product.minOrder), product.stock) }]; return old.map(x => x.product.id === product.id ? { ...x, qty: Math.max(product.minOrder, Math.min(product.stock, x.qty + delta)) } : x); });
  const updateOrder = async (id: string, status: string, reason = "") => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { flash("Database connection is unavailable."); return; }
    const statusMap: Record<string, string> = {
      "Accepted": "accepted", "Processing": "processing", "Ready For Dispatch": "ready_for_dispatch",
      "Dispatched": "dispatched", "Out for Delivery": "out_for_delivery", "Delivered": "delivered",
      "Rejected": "rejected", "Cancelled": "cancelled", "Cancellation Rejected": "cancellation_rejected",
      "Partially Fulfilled": "partially_fulfilled"
    };
    try {
      if (role === "dealer") {
        const { error } = await supabase.rpc("dealer_cancel_order", { p_order_id: id, p_reason: reason });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("distributor_update_order", {
          p_order_id: id, p_new_status: statusMap[status] || status.toLowerCase().replaceAll(" ", "_"),
          p_note: reason || null, p_estimated_delivery_at: null
        });
        if (error) throw error;
      }
      setOrdersRefreshKey(value => value + 1);
      flash("Order updated successfully.");
    } catch (error) { flash(error instanceof Error ? error.message : "Could not update order."); }
  };
  const placeOrder = async () => {
    if (role !== "dealer" || !cart.length || orderBusy) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { flash("Database connection is unavailable."); return; }
    setOrderBusy(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session?.access_token) throw new Error("Your session expired. Sign in again.");
      const { data: dealer, error: dealerError } = await supabase.from("dealer_profiles").select("address,city,pin_code,distributor_id").eq("user_id", session.user.id).single();
      if (dealerError) throw dealerError;
      if (!dealer.distributor_id) throw new Error("Your dealer account is not linked to a distributor yet. Contact support to connect your account.");
      const deliveryAddress = [dealer.address, dealer.city, dealer.pin_code].filter(Boolean).join(", ");
      if (!deliveryAddress.trim()) throw new Error("Add your delivery address before placing an order.");
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          items: cart.map(line => ({ product_id: String(line.product.id), quantity: line.qty })),
          delivery_address: deliveryAddress,
          dealer_note: null
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not place your order.");
      setCart([]); setShowCart(false); setPage("My Orders");
      setOrdersRefreshKey(value => value + 1);
      flash("Order placed successfully and sent to your distributor.");
    } catch (error) { flash(error instanceof Error ? error.message : "Could not place your order."); }
    finally { setOrderBusy(false); }
  };
  const navItems = role === "distributor" ? [{ name: "Overview", icon: LayoutDashboard }, { name: "Orders", icon: ClipboardList }, { name: "Products & Stock", icon: Boxes }, { name: "Dealers", icon: Users }, { name: "Sales & Excel", icon: FileSpreadsheet }, { name: "Settings", icon: Settings }] : [{ name: "Product Catalogue", icon: Package }, { name: "My Orders", icon: ClipboardList }, { name: "My Account", icon: CircleUserRound }];
  const selectPage = (name: string) => { setPage(name); setMobileNav(false); if (name === "My Cart") setShowCart(true); if (name === "Product Catalogue" || name === "Products & Stock") setCatalogueRefreshKey(value => value + 1); };
  const csvExport = () => { const rows = [["Order ID", "Dealer", "Area", "Products", "Total Pieces", "Order Value (INR)", "Status", "Order Time"], ...orders.filter(o => o.status === "Delivered").map(o => [o.id, o.dealer, o.area, o.products.join("; "), o.pieces, o.amount, o.status, o.time])]; const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\r\n"); const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "wholesale-sales-report.csv"; a.click(); URL.revokeObjectURL(url); flash("Sales report exported. Open the CSV file in Excel."); };
  const title = page === "Overview" ? "Good morning, Distributor" : page;
  const isCatalogue = page === "Product Catalogue" || page === "Products & Stock" || page === "Overview";
  if (!authReady) return <main className="login-screen"><section className="login-card"><div className="login-brand"><div className="brand-mark">s<span>.</span></div><div><strong>supplydesk</strong><small>WHOLESALE HOMEWARE</small></div></div><p className="login-intro" role="status">Restoring your secure session…</p></section></main>;
  if (!signedIn) return <main className="login-screen">
    <section className="login-card">
      <div className="login-brand"><div className="brand-mark">s<span>.</span></div><div><strong>supplydesk</strong><small>WHOLESALE HOMEWARE</small></div></div>
      <div className="login-kicker">BUSINESS PORTAL</div>
      <h1>{resetMode ? "Set a new password" : authMode === "login" ? "Sign in to your workspace" : "Create your account"}</h1>
      <p className="login-intro">{resetMode ? "Choose a new password of at least 8 characters." : authMode === "signup" ? (loginRole === "distributor" ? "Create your distributor business workspace." : "Create an account to place and track wholesale orders.") : loginRole === "distributor" ? "Distributor business login." : "Sign in to place and track your wholesale orders."}</p>
      {loginRole === "distributor" && !resetMode && <p className="login-note">{authMode === "signup" ? "Register your distributor business to get your own workspace." : "Sign in to manage your distributor business."}</p>}
      {!resetMode && <div className="workspace-tabs" aria-label="Choose workspace">
        <button type="button" className={loginRole === "dealer" ? "active" : ""} onClick={() => { setLoginRole("dealer"); setAuthMode("login"); setLoginError(""); setAuthNotice(""); }}>Dealer</button>
        <button type="button" className={loginRole === "distributor" ? "active" : ""} onClick={() => { setLoginRole("distributor"); setAuthMode("login"); setLoginError(""); setAuthNotice(""); }}>Distributor</button>
      </div>}
      {!resetMode && <div className="login-role-tabs">
        <button type="button" className={authMode === "login" ? "chosen" : ""} onClick={() => { setAuthMode("login"); setLoginError(""); setAuthNotice(""); }}>Login</button>
        <button type="button" className={authMode === "signup" ? "chosen" : ""} onClick={() => { setAuthMode("signup"); setLoginError(""); setAuthNotice(""); }}>Create account</button>
      </div>}
      <form className="login-form" onSubmit={async event=>{
        event.preventDefault();
        setLoginError("");
        setAuthNotice("");
        const supabase = getSupabaseBrowserClient();
        if (!supabase) { setLoginError("Supabase authentication is not configured in Vercel."); return; }
        if (resetMode) {
          if (newPassword.length < 8) { setLoginError("Use a password with at least 8 characters."); return; }
          setAuthBusy(true);
          try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            await supabase.auth.signOut();
            setResetMode(false);
            setNewPassword("");
            setLoginPassword("");
            setAuthMode("login");
            setAuthNotice("Password updated. Sign in with your new password.");
            window.history.replaceState({}, document.title, window.location.pathname);
          } catch (error) {
            setLoginError(error instanceof Error ? error.message : "Could not update password.");
          } finally { setAuthBusy(false); }
          return;
        }
        if (authMode === "signup") {
          const isDistributorSignup = loginRole === "distributor";
          if (!signupName.trim() || !signupBusiness.trim() || !signupAddress.trim() || (!isDistributorSignup && !signupCity.trim()) || !loginEmail.trim() || loginPassword.length < 8) { setLoginError("Complete all required fields and use a password of at least 8 characters."); return; }
          setAuthBusy(true);
          try {
            const metadata = isDistributorSignup
              ? { account_type: "distributor", full_name: signupName.trim(), business_name: signupBusiness.trim(), address: signupAddress.trim(), phone: signupPhone.trim() }
              : { account_type: "dealer", full_name: signupName.trim(), role: "dealer", store_name: signupBusiness.trim(), contact_name: signupName.trim(), address: signupAddress.trim(), city: signupCity.trim(), phone: signupPhone.trim() };
            const { data, error } = await supabase.auth.signUp({ email: loginEmail.trim(), password: loginPassword, options: { data: metadata } });
            if (error) throw error;
            if (data.session && data.user) {
              if (isDistributorSignup) {
                setRole("distributor"); setPage("Overview"); setSignedIn(true);
                flash("Distributor account created. Welcome to SupplyDesk.");
              } else {
                setLoginShop(signupBusiness.trim()); setDealerName(signupBusiness.trim()); setReviewStatus("pending");
                setRole("dealer"); setPage("Product Catalogue"); setSignedIn(true);
                flash("Dealer account created. You are signed in.");
              }
              setLoginPassword(""); setLoginError("");
            } else {
              setLoginError(isDistributorSignup
                ? "Distributor account created. Check your inbox (and spam folder) to confirm your email, then sign in."
                : "Account created. Check your inbox (and spam folder) to confirm your email, then sign in. No distributor approval is required to log in.");
              setAuthMode("login");
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : "Could not create account.";
            const normalized = message.toLowerCase();
            if (normalized.includes("already registered") || normalized.includes("already exists") || normalized.includes("user already")) {
              setAuthMode("login");
              setLoginError("This email already has an account. Use Login with the same password, or choose Forgot password if you need to reset it.");
            } else setLoginError(message);
          } finally { setAuthBusy(false); }
          return;
        }
        if(!loginEmail.trim()||!loginPassword.trim()){setLoginError("Enter your email and password.");return;}
        setAuthBusy(true);
        try {
        const {data:authData,error:authError}=await supabase.auth.signInWithPassword({email:loginEmail.trim(),password:loginPassword});
        if(authError||!authData.user) throw authError || new Error("Sign-in failed.");
        // A valid user can restore their own missing dealer profile; role always comes from the database.
        const { error: repairError } = await supabase.rpc("ensure_my_account_profile");
        if (repairError) console.warn("Account profile recovery was unavailable", repairError.message);
        const {data:profile,error:profileError}=await supabase.from("profiles").select("role,full_name").eq("id",authData.user.id).single();
        if(profileError||!profile){throw new Error("Your email and password are valid, but the account profile is missing. Try again; if it continues, contact support instead of creating another account.");}
        const actualRole=profile.role==="distributor"?"distributor":profile.role==="dealer"?"dealer":null;
        if(!actualRole){throw new Error("This account has an unsupported workspace role. Ask the system administrator to configure it.");}
        if(actualRole==="dealer"){
          const {data:dealerProfile,error:dealerError}=await supabase.from("dealer_profiles").select("store_name,review_status").eq("user_id",authData.user.id).maybeSingle();
          if(dealerError) throw dealerError;
          setDealerName(dealerProfile?.store_name || "Your shop");
          setLoginShop(dealerProfile?.store_name || "");
          setReviewStatus(dealerProfile?.review_status || "pending");
          setPage("Product Catalogue");
        }else setPage("Overview");
        setRole(actualRole); setSignedIn(true); window.localStorage.removeItem("supplydesk-demo-session"); flash("Signed in successfully.");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Sign-in failed.";
          if (message.toLowerCase().includes("invalid login credentials") || message.toLowerCase().includes("invalid credentials")) {
            setLoginError("Email or password is incorrect. Try again, or use Forgot password to reset it.");
          } else {
            setLoginError(message);
          }
        } finally { setAuthBusy(false); }
      }}>
        {resetMode ? (
          <label>New password<input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" minLength={8} required/></label>
        ) : <>
          {authMode === "signup" && <>
            <label>Full name<input value={signupName} onChange={e=>setSignupName(e.target.value)} placeholder="Your full name" autoComplete="name" required/></label>
            <label>{loginRole === "distributor" ? "Distributor business name" : "Shop / business name"}<input value={signupBusiness} onChange={e=>setSignupBusiness(e.target.value)} placeholder={loginRole === "distributor" ? "Your distributor business" : "Your shop name"} required/></label>
            <label>Mobile number<input type="tel" value={signupPhone} onChange={e=>setSignupPhone(e.target.value)} placeholder="Your contact number" autoComplete="tel"/></label>
            <label>Business address<input value={signupAddress} onChange={e=>setSignupAddress(e.target.value)} placeholder="Street and area" required/></label>
            {loginRole === "dealer" && <label>City<input value={signupCity} onChange={e=>setSignupCity(e.target.value)} required/></label>}
          </>}
          {authMode === "login" && loginRole==="dealer"&&<p className="login-note">Use the email and password you registered with. Your shop name is loaded from your account.</p>}
          <label>Email<input type="email" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} placeholder={loginRole==="dealer"?"dealer@example.com":"admin@example.com"} autoComplete="username" required/></label>
          <label>Password<input type="password" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} placeholder={authMode === "signup" ? "At least 8 characters" : "Enter your password"} autoComplete={authMode === "signup" ? "new-password" : "current-password"} minLength={authMode === "signup" ? 8 : undefined} required/></label>
        </>}
        {loginError&&<p className="login-error" role="alert">{loginError}</p>}
        {authNotice&&<p className="login-note" role="status">{authNotice}</p>}
        {resetMode ? (
          <button className="login-submit" type="submit" disabled={authBusy}>{authBusy ? "Saving…" : "Save new password"} <ChevronRight size={17}/></button>
        ) : <>
          <button className="login-submit" type="submit" disabled={authBusy}>{authBusy ? "Please wait…" : authMode === "signup" ? (loginRole === "distributor" ? "Create Distributor account" : "Create Dealer account") : loginRole === "distributor" ? "Sign in to Distributor" : "Sign in"} <ChevronRight size={17}/></button>
          {authMode === "login" && loginRole === "dealer" && <button type="button" className="login-reset" disabled={authBusy} onClick={async () => {
            setLoginError(""); setAuthNotice("");
            if (!loginEmail.trim()) { setLoginError("Enter your email address first, then choose Forgot password."); return; }
            const authClient = getSupabaseBrowserClient();
            if (!authClient) { setLoginError("Supabase authentication is not configured in Vercel."); return; }
            setAuthBusy(true);
            try {
              const { error } = await authClient.auth.resetPasswordForEmail(loginEmail.trim(), { redirectTo: window.location.origin });
              if (error) throw error;
              setAuthNotice("If this email is registered, a password reset link has been sent. Check your inbox and spam folder.");
            } catch (error) { setLoginError(error instanceof Error ? error.message : "Could not send password reset email."); }
            finally { setAuthBusy(false); }
          }}>Forgot password?</button>}
        </>}
      </form>
      <p className="login-note">Dealer and distributor workspaces are separate. Your account type is assigned securely during registration.</p>
      {loginRole === "dealer" && <p className="login-demo-note">Dealer accounts can sign in whenever they want. Distributor approval is not required for login.</p>}
    </section>
  </main>;
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brand-mark">s<span>.</span></div><div><strong>supplydesk</strong><small>WHOLESALE HOMEWARE</small></div><button className="icon-btn close-nav" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18}/></button></div>
      <div className="workspace-label">WORKSPACE</div>
      <div className="account-menu-anchor">
        <div className="signed-in-badge"><span className="signed-in-dot"/><div><strong>{role === "distributor" ? "Distributor Admin" : "Dealer Portal"}</strong><small>{role === "distributor" ? "Business management" : dealerName}</small></div><button className="account-settings-trigger" onClick={() => setAccountMenuOpen(open => !open)} aria-label="Account settings" aria-expanded={accountMenuOpen} title="Account settings"><Settings size={16}/></button></div>
        {accountMenuOpen && <div className="account-menu" role="menu">
          <div className="account-menu-heading">ACCOUNT</div>
          <button type="button" role="menuitem" onClick={() => { setPage(role === "dealer" ? "My Account" : "Settings"); setAccountMenuOpen(false); setMobileNav(false); }}><Settings size={15}/><span>Account settings</span></button>
          <div className="account-menu-status">{role === "dealer" ? "Dealer / shop account" : "Separate administrator account"}</div>
          <button type="button" role="menuitem" className="account-menu-signout" onClick={async () => { const supabase=getSupabaseBrowserClient(); if(supabase) await supabase.auth.signOut(); setSignedIn(false); setLoginPassword(""); setLoginError(""); setAccountMenuOpen(false); }}><ArrowUpRight size={15}/><span>Sign out</span></button>
        </div>}
      </div>
      <div className="nav-label">{role === "distributor" ? "MANAGE BUSINESS" : "DEALER PORTAL"}</div>
      <nav>{navItems.map(({ name, icon: Icon }) => <button key={name} onClick={() => selectPage(name)} className={`nav-item ${page === name ? "selected" : ""}`}><Icon size={18}/><span>{name}</span>{name === "Orders" && orders.some(o => o.status === "Pending") && <b className="nav-count">{orders.filter(o => o.status === "Pending").length}</b>}{name === "My Cart" && cartCount > 0 && <b className="nav-count">{cartCount}</b>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-dot"/><strong>Need a hand?</strong><p>Our support team is here to help your business run smoothly.</p><button onClick={() => flash("Support contact: add distributor support details in settings.")}>Contact support <ArrowUpRight size={14}/></button></div><div className="user-mini"><div className="avatar">{role === "distributor" ? "AD" : "SG"}</div><div className="user-info"><strong>{role === "distributor" ? "Distributor Admin" : dealerName}</strong><small>{role === "distributor" ? "Distributor account" : "Dealer account"}</small></div><span className="online-dot"/></div></div>
    </aside>
    {mobileNav && <button className="scrim" onClick={() => setMobileNav(false)} aria-label="Close menu"/>}
    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="icon-btn mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={20}/></button><div className="breadcrumb">Workspace <ChevronRight size={14}/> <strong>{page}</strong></div></div><div className="top-actions"><div className="status-pill"><span/> System operational</div><button className="icon-btn theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`} title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>{theme === "light" ? <Moon size={19}/> : <Sun size={19}/>}</button><button className="icon-btn notification-btn" onClick={() => { setPage(role === "distributor" ? "Orders" : "My Orders"); }} aria-label="View notifications"><Bell size={19}/>{orders.some(o => o.status === "Pending") && <i/>}</button><div className="top-avatar">{role === "distributor" ? "AD" : "SG"}</div></div></header>
      <div className="content-wrap">
        <section className="page-heading"><div><div className="eyebrow">{role === "distributor" ? "DISTRIBUTOR WORKSPACE" : "DEALER WORKSPACE"} <span className="live-tag"><span/> LIVE</span></div><h1>{role === "distributor" && page === "Overview" ? <>Good morning, <em>Distributor.</em></> : title}</h1><p>{role === "distributor" ? (page === "Overview" ? "Here's what's happening with your distribution business today." : page === "Orders" ? "Review incoming orders and keep every delivery moving." : page === "Products & Stock" ? "Manage wholesale products, brands, carton quantities, prices and stock." : page === "Sales & Excel" ? "Review delivered sales and export reports for your records." : "Manage dealer access and account details.") : (page === "Product Catalogue" ? "Order crockery, glassware, kitchenware and homeware by carton or box." : page === "My Orders" ? "Track your orders from confirmation through delivery." : "Manage your shop details and orders.")}</p></div><div className="heading-actions">{role === "dealer" && <button className="btn btn-primary" onClick={() => setShowCart(true)}><ShoppingCart size={16}/> Cart <span className="button-count">{cartCount}</span></button>}{role === "distributor" && page === "Products & Stock" && <button className="btn btn-primary" onClick={startNewProduct}><Plus size={17}/> Add product</button>}{role === "distributor" && page === "Sales & Excel" && <button className="btn btn-primary" onClick={csvExport}><FileSpreadsheet size={16}/> Export Excel CSV</button>}</div></section>
        {role === "distributor" && page === "Overview" && <>
          <section className="metric-grid"><Metric label="Total sales" value={money(orders.filter(o => o.status === "Delivered").reduce((n,o) => n + o.amount, 0))} change="Delivered orders" icon="₹" tone="green"/><Metric label="Orders to review" value={String(orders.filter(o => o.status === "Pending").length).padStart(2,"0")} change="Needs your attention" icon="↗" tone="orange"/><Metric label="Active products" value={String(products.length).padStart(2,"0")} change="Crockery, glassware & more" icon="▦" tone="purple"/><Metric label="Low stock items" value={String(products.filter(p => p.stock < 20).length).padStart(2,"0")} change="Restock recommended" icon="!" tone="red"/></section>
          <section className="feature-banner"><div className="banner-symbol"><Package size={23}/></div><div className="banner-copy"><span>YOUR BUSINESS, IN SYNC</span><h2>Every order. One clear picture.</h2><p>Orders, inventory and sales reports come together in one workspace.</p></div><div className="banner-art"><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="art-box"><Package size={32}/></div><div className="art-chip chip-one"><Check size={13}/> Stock synced</div><div className="art-chip chip-two"><Truck size={14}/> On its way</div></div></section>
          <section className="dashboard-grid"><div className="panel orders-panel"><div className="panel-head"><div><h2>Recent orders</h2><p>Latest activity from your dealers</p></div><button className="text-link" onClick={() => setPage("Orders")}>View all <ChevronRight size={15}/></button></div>{orderError && <p className="login-error">{orderError}</p>}{ordersLoading ? <p className="helper-note">Loading live orders…</p> : <OrderTable orders={orders.slice(0,4)} updateOrder={updateOrder}/>}</div><div className="panel inventory-panel"><div className="panel-head"><div><h2>Stock overview</h2><p>Inventory that needs a look</p></div><button className="icon-btn subtle" onClick={() => setPage("Products & Stock")} aria-label="View stock"><ArrowUpRight size={17}/></button></div><div className="stock-summary"><div><span className="stock-number">{products.reduce((n,p)=>n+p.stock,0).toLocaleString("en-IN")}</span><small>Cartons / boxes in stock</small></div><div className="stock-progress"><span style={{width:"74%"}}/></div><div className="stock-foot"><span><i className="legend-dot green-dot"/> In stock</span><strong>{products.filter(p=>p.stock>=20).length} products</strong></div><div className="stock-foot"><span><i className="legend-dot orange-dot"/> Low stock</span><strong>{products.filter(p=>p.stock<20).length} products</strong></div></div><div className="low-stock-list">{products.filter(p=>p.stock<50).slice(0,3).map(p=><div className="low-stock-row" key={p.id}><div className={`tiny-product ${p.color}`}>{p.mark}</div><div className="low-product-name"><strong>{p.name}</strong><small>{p.sku}</small></div><span className={p.stock<20?"stock-badge danger":"stock-badge warning"}>{p.stock} left</span></div>)}</div></div></section>
          <section className="panel quick-panel"><div className="panel-head"><div><h2>Quick actions</h2><p>Get to the things you do most</p></div></div><div className="quick-actions"><QuickAction icon={<ClipboardList size={19}/>} title="Review new orders" detail="Accept or reject dealer orders" onClick={()=>setPage("Orders")}/><QuickAction icon={<Boxes size={19}/>} title="Manage inventory" detail="Update products and stock" onClick={()=>setPage("Products & Stock")}/><QuickAction icon={<FileSpreadsheet size={19}/>} title="Export sales report" detail="Download delivered sales" onClick={csvExport}/></div></section>
        </>}
        {role === "distributor" && page === "Orders" && <section className="panel full-panel"><div className="panel-head"><div><h2>All orders</h2><p>Accept, process and complete dealer orders.</p></div><span className="soft-count">{orders.length} orders</span></div>{orderError && <p className="login-error">{orderError}</p>}{ordersLoading ? <p className="helper-note">Loading live orders…</p> : <OrderTable orders={orders} updateOrder={updateOrder}/>}</section>}
        {role === "distributor" && page === "Products & Stock" && <section className="panel product-admin-panel">
          <div className="panel-head"><div><h2>Product catalogue</h2><p>Add products, set wholesale prices and manage available stock.</p></div><button className="btn btn-primary" type="button" onClick={startNewProduct}><Plus size={16}/> Add product</button></div>
          {productError && <p className="login-error product-admin-error" role="alert">{productError}</p>}
          {productFormOpen && <form className="product-form" onSubmit={saveProduct}>
            <div className="product-form-title"><strong>{editingProductId === null ? "Add a new product" : "Edit product"}</strong><span>Fields marked * are required.</span></div>
            <div className="product-form-grid">
              <label>Product name *<input value={productDraft.name} onChange={e=>setProductDraft(v=>({...v,name:e.target.value}))} placeholder="e.g. Ceramic Dinner Plate" maxLength={120} required/></label>
              <label>SKU / product code *<input value={productDraft.sku} onChange={e=>setProductDraft(v=>({...v,sku:e.target.value.toUpperCase()}))} placeholder="e.g. CDP-101" maxLength={60} required/></label>
              <label>Category *<input value={productDraft.category} onChange={e=>setProductDraft(v=>({...v,category:e.target.value}))} placeholder="e.g. Crockery" maxLength={80} required list="supplydesk-category-suggestions"/><datalist id="supplydesk-category-suggestions">{productCategories.filter(x=>x!=="All products").map(x=><option value={x} key={x}/>)}</datalist></label>
              <label>Brand<input value={productDraft.brand} onChange={e=>setProductDraft(v=>({...v,brand:e.target.value}))} placeholder="Brand name" maxLength={100}/></label>
              <label>Selling unit *<select value={productDraft.unit} onChange={e=>setProductDraft(v=>({...v,unit:e.target.value}))}><option value="piece">Piece</option><option value="box">Box</option><option value="carton">Carton</option><option value="set">Set</option><option value="pack">Pack</option></select></label>
              <label>Product variant type *<select value={productDraft.productType} onChange={e=>setProductDraft(v=>({...v,productType:e.target.value as "color" | "non_color",colorName:e.target.value==="color"?v.colorName:"",variants:e.target.value==="color"?v.variants:[{colorName:"",colorHex:"#a3a3a3",capacityLiters:""}]}))}><option value="non_color">Non-Color Variant</option><option value="color">Color Variant</option></select></label>
              <div className="product-variants-editor" style={{gridColumn:"1 / -1",border:"1px solid var(--line)",borderRadius:12,padding:14,display:"grid",gap:12}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><strong>Size & color variations</strong><button className="btn btn-outline" type="button" onClick={()=>setProductDraft(v=>({...v,variants:[...v.variants,{colorName:"",colorHex:"#e53935",capacityLiters:""}]}))}>+ Add variant</button></div><small>Add one row for each available color/size combination. Product photos are uploaded below as the shared gallery.</small>{productDraft.variants.map((variant,index)=><div key={index} style={{display:"grid",gridTemplateColumns:productDraft.productType==="color"?"1fr 1fr auto":"1fr auto",gap:10,alignItems:"end"}}>{productDraft.productType==="color"&&<div className="product-variant-color-field"><span className="product-variant-color-label">Color {index+1} *</span><div className="product-variant-color-options" role="group" aria-label={`Choose color for variant ${index+1}`}>{COLOR_OPTIONS.map(([colorName,colorHex])=><button key={colorName} type="button" className={`color-swatch${variant.colorName?.trim().toLowerCase()===colorName.toLowerCase()?" selected":""}`} aria-pressed={variant.colorName?.trim().toLowerCase()===colorName.toLowerCase()} onClick={()=>setProductDraft(v=>({...v,colorName:index===0?colorName:v.colorName,variants:v.variants.map((item,i)=>i===index?{...item,colorName,colorHex}:item)}))} title={colorName}><span className="color-swatch-dot" style={{backgroundColor:colorHex,border:colorName==="white"?"1px solid #9ca3af":undefined}}/><span className="color-swatch-name">{colorName}</span></button>)}</div></div>}<label>Capacity (liters)<input type="number" min="0.01" step="0.01" value={variant.capacityLiters == null ? "" : String(variant.capacityLiters)} onChange={e=>setProductDraft(v=>({...v,variants:v.variants.map((item,i)=>i===index?{...item,capacityLiters:e.target.value}:item)}))} placeholder="e.g. 1.5"/></label>{productDraft.variants.length>1&&<button type="button" className="btn btn-outline" onClick={()=>setProductDraft(v=>({...v,variants:v.variants.filter((_,i)=>i!==index)}))}>Remove</button>}</div>)}</div>
              <label>Pieces per unit *<input type="number" min="1" step="1" value={productDraft.piecesPerUnit} onChange={e=>setProductDraft(v=>({...v,piecesPerUnit:e.target.value}))} required/></label>
              <label>Minimum order quantity *<input type="number" min="1" step="1" value={productDraft.minimumOrderQuantity} onChange={e=>setProductDraft(v=>({...v,minimumOrderQuantity:e.target.value}))} required/></label>
              <label>Wholesale price per unit (₹) *<input type="number" min="0" step="0.01" value={productDraft.price} onChange={e=>setProductDraft(v=>({...v,price:e.target.value}))} placeholder="0.00" required/></label>
              <label>Available stock (units) *<input type="number" min="0" step="1" value={productDraft.stock} onChange={e=>setProductDraft(v=>({...v,stock:e.target.value}))} required/></label>
              <div className="product-image-field">
                <span className="product-image-field-label">Product photos *</span>
                <div className="product-image-upload-panel">
                  <input ref={productImageInputRef} className="product-image-input" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="Choose multiple product photos" onChange={event => {
                    const input = event.currentTarget;
                    const files = Array.from(input.files || []);
                    input.value = "";
                    if (!files.length) return;
                    if (files.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type))) { setProductError("Choose JPG, PNG or WebP photos."); return; }
                    if (files.some(file => file.size > 20 * 1024 * 1024)) { setProductError("Each image must be smaller than 20 MB."); return; }
                    setProductError("");
                    const previews = files.map(file => URL.createObjectURL(file));
                    setProductDraft(value => {
                      const previousFiles = value.imageFiles.length ? value.imageFiles : value.imageFile ? [value.imageFile] : [];
                      const previousPreviews = value.imagePreviews.length ? value.imagePreviews : value.imagePreview ? [value.imagePreview] : [];
                      return {
                        ...value,
                        imageUrl: "",
                        imageFile: null,
                        imagePreview: value.imagePreview || previews[0] || "",
                        imageFiles: [...previousFiles, ...files],
                        imagePreviews: [...previousPreviews, ...previews],
                      };
                    });
                  }} />
                  <button className="btn btn-outline product-photo-select" type="button" onClick={() => productImageInputRef.current?.click()}><Images size={16}/>{productDraft.imagePreviews.length ? "Add more photos" : "Choose photos"}</button>
                  <span className="product-image-count">{productDraft.imagePreviews.length} {productDraft.imagePreviews.length === 1 ? "photo" : "photos"} selected</span>
                </div>
                <small>Choose multiple JPG, PNG or WebP photos at once. Add more photos without replacing the ones already selected. The first photo is the main product image.</small>
              </div>
              {(productDraft.imageFile || productDraft.imageUrl) && <div className="product-background-tool"><button className="btn btn-outline" type="button" disabled={productSaving || backgroundRemoving} onClick={handleRemoveProductBackground}><Sparkles size={15}/>{backgroundRemoving ? "Removing background…" : "Remove background"}</button><small>Removes the background and trims empty edges. First use downloads a one-time model (up to about 225 MB).</small></div>}
              <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 12 }}>
                {productDraft.imagePreviews.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{productDraft.imagePreviews.map((src,index)=><img key={`${src}-${index}`} src={src} alt={`Product photo ${index+1}`} style={{ width: 88, height: 88, objectFit: "contain", background: "#fff", borderRadius: 8, border: "1px solid #dce5e2" }} />)}</div> : productDraft.imagePreview ? <img src={productDraft.imagePreview} alt="Product image preview" style={{ width: 88, height: 88, objectFit: "contain", background: "#fff", borderRadius: 8, border: "1px solid #dce5e2" }} /> : <span style={{ color: "#718286", fontSize: 13 }}>No image selected</span>}
                {productDraft.imagePreview && <button className="btn btn-outline" type="button" disabled={productSaving} onClick={() => {
                  if (productImageInputRef.current) productImageInputRef.current.value = "";
                  setProductDraft(value => ({ ...value, imageUrl: "", imageFile: null, imagePreview: "", imageFiles: [], imagePreviews: [] }));
                }}>Remove all photos</button>}
              </div>
            </div>
            <div className="product-form-actions"><button className="btn btn-primary" type="submit" disabled={productSaving}>{productSaving ? "Saving…" : editingProductId === null ? "Save product" : "Save changes"}</button><button className="btn btn-outline" type="button" disabled={productSaving} onClick={()=>{setProductFormOpen(false);setEditingProductId(null);setProductDraft(emptyProductDraft);setProductError("");}}>Cancel</button></div>
          </form>}
          <div className="product-admin-footer"><span>{products.length} products saved in your catalogue</span><span>Saved products are shared with the assigned dealer catalogue subject to database access rules.</span></div>
        </section>}
        {isCatalogue && (page !== "Overview" || role === "dealer") && <section className="catalogue-section">
          <div className="catalogue-toolbar"><label className="search-box catalogue-search"><Search size={18}/><input aria-label="Search products" placeholder="Search by product name, SKU, brand or category..." value={search} onChange={e=>setSearch(e.target.value)}/>{search && <button type="button" onClick={()=>setSearch("")} aria-label="Clear search"><X size={15}/></button>}</label><div className="catalogue-toolbar-actions"><span className="catalogue-result-count">{groupedFiltered.length} {groupedFiltered.length === 1 ? "product" : "products"}</span>{role === "dealer" && <button className="btn btn-outline cart-toolbar" onClick={()=>setShowCart(true)}><ShoppingCart size={16}/> Cart ({cartCount})</button>}</div></div>
          <div className="category-row">{productCategories.map(c=><button key={c} className={category===c?"category-chip active":"category-chip"} onClick={()=>setCategory(c)}>{c}</button>)}</div>
          {productError && role === "dealer" && <div className="empty-state"><AlertTriangle size={26}/><h3>Could not load the catalogue</h3><p>{productError}</p></div>}
          {productsLoading ? <div className="empty-state"><Package size={28}/><h3>Loading catalogue</h3><p>Checking products saved in your business account.</p></div> : <><div className="product-grid">{groupedFiltered.map(({groupKey,variants})=>{const p=variants.find(v=>String(v.id)===selectedVariantByGroup[groupKey]) || variants[0];return <article className="product-card" key={groupKey}><div className={`product-visual ${p.color}`}><span className="product-category">{p.category}</span>{p.imagePath ? <><img className="product-image" src={(p.imagePaths?.[selectedPhotoByProduct[String(p.id)] || 0] || p.imagePath)} alt={p.name} loading="lazy"/>{(p.imagePaths?.length || 0) > 1 && <div className="product-photo-thumbs">{p.imagePaths?.map((src,index)=><button type="button" key={`${p.id}-photo-${index}`} aria-label={`Show product photo ${index+1}`} className={selectedPhotoByProduct[String(p.id)]===index?"active":""} onClick={()=>setSelectedPhotoByProduct(old=>({...old,[String(p.id)]:index}))}><img src={src} alt="" /></button>)}</div>}</> : <div className="product-illustration">{p.mark}</div>}<span className={p.stock<20?"stock-label low":"stock-label"}>{p.stock<1?"Out of stock":p.stock<20?"Low stock":`${p.stock} ${p.unit}s in stock`}</span></div><div className="product-info"><div className="sku">{p.brand ? p.brand+" · " : ""}SKU {p.sku}</div><h3>{p.name.replace(/\s+\d+\s*L$/i,"")}{p.capacityLiters ? ` · ${p.capacityLiters} L` : ""}{p.productType === "color" && p.colorName ? ` · ${p.colorName}` : ""}</h3>{variants.some(v=>v.productType==="color"&&v.colorName) && <div className="product-color-swatches" role="group" aria-label="Choose product color">{Array.from(new Set(variants.filter(v=>v.productType==="color"&&v.colorName).map(v=>v.colorName!.trim()))).map(color=>{const match=variants.find(v=>v.colorName?.trim().toLowerCase()===color.toLowerCase());const selected=variants.some(v=>String(v.id)===String(p.id)&&v.colorName?.trim().toLowerCase()===color.toLowerCase());return <button type="button" key={color} className={`color-swatch${selected?" selected":""}`} onClick={()=>match&&setSelectedVariantByGroup(old=>({...old,[groupKey]:String(match.id)}))} aria-label={`Select ${color}`} title={color}><span className="color-swatch-dot" style={{backgroundColor:getColorSwatch(color,match?.variants?.find(item=>item.colorName?.trim().toLowerCase()===color.toLowerCase())?.colorHex),border:color.toLowerCase()==="white"?"1px solid #9ca3af":undefined}}/><span className="color-swatch-name">{color}</span></button>})}</div>}{variants.length>1 && <label className="variant-picker-label">Size / Capacity<select className="variant-picker" value={String(p.id)} onChange={e=>setSelectedVariantByGroup(old=>({...old,[groupKey]:e.target.value}))}>{variants.map(v=>{const capacityMatch=v.name.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*L$/i);const sizeLabel=v.capacityLiters!=null?`${v.capacityLiters} L`:capacityMatch?`${capacityMatch[1]} L`:v.sku;const colorLabel=v.productType==="color"&&v.colorName?` · ${v.colorName}`:"";return <option key={v.id} value={String(v.id)}>{sizeLabel}{colorLabel} · {v.sku} · {money(v.price)} · {v.stock} in stock</option>})}</select></label>}<p>{p.piecesPerCarton} {p.unit === "piece" ? "piece" : "pieces"} per {p.unit} · Min. {p.minOrder}</p><div className="product-buy"><div><strong>{money(p.price)}</strong><small>per {p.unit.toLowerCase()}</small></div>{role === "dealer" ? <button className="add-btn" disabled={p.stock<p.minOrder} onClick={()=>{add(p,p.minOrder);flash(`${p.name} added to cart`);}}><Plus size={16}/> Add</button> : <div className="product-admin-actions"><button className="btn btn-outline product-edit-btn" type="button" onClick={()=>startEditProduct(p)}><Settings size={14}/> Edit</button><button className="btn btn-outline product-duplicate-btn" type="button" onClick={()=>startDuplicateProduct(p)}><Copy size={14}/> Duplicate</button></div>}</div>{role === "dealer" && cart.some(x=>x.product.id===p.id) && <div className="inline-quantity"><button onClick={()=>add(p,-1)} aria-label="Decrease quantity"><Minus size={13}/></button><span>{cart.find(x=>x.product.id===p.id)?.qty} in cart</span><button onClick={()=>add(p,1)} aria-label="Increase quantity"><Plus size={13}/></button></div>}</div></article>})}</div>{filtered.length===0&&<div className="empty-state"><Package size={30}/><h3>{productsLoading ? "Loading products" : search || category !== "All products" ? "No products found" : "No products yet"}</h3><p>{search || category !== "All products" ? "Try another search or category." : role === "distributor" ? "Select Add product above to publish your first item." : "Your distributor has not published products yet."}</p>{role === "distributor" && page === "Products & Stock" && <button className="btn btn-primary" onClick={startNewProduct}><Plus size={16}/> Add product</button>}</div>}</>}
        </section>}
        {role === "distributor" && page === "Sales & Excel" && <section className="panel full-panel"><div className="panel-head"><div><h2>Delivered sales ledger</h2><p>Only delivered orders count as completed sales.</p></div><button className="btn btn-primary" onClick={csvExport}><FileSpreadsheet size={16}/> Export CSV for Excel</button></div><div className="sales-summary"><div><span>Completed sales value</span><strong>{money(orders.filter(o=>o.status==="Delivered").reduce((n,o)=>n+o.amount,0))}</strong></div><div><span>Delivered orders</span><strong>{orders.filter(o=>o.status==="Delivered").length}</strong></div><div><span>Pieces delivered</span><strong>{orders.filter(o=>o.status==="Delivered").reduce((n,o)=>n+o.pieces,0)}</strong></div></div><OrderTable orders={orders.filter(o=>o.status==="Delivered")} updateOrder={updateOrder}/></section>}
        {role === "distributor" && page === "Dealers" && <section className="panel full-panel"><div className="panel-head"><div><h2>Dealer accounts</h2><p>Review dealers linked to your distributor account.</p></div><span className="soft-count">{dealers.length} dealers</span></div>{dealersLoading ? <p className="helper-note">Loading dealer accounts…</p> : dealers.length === 0 ? <div className="empty-table">No dealers are linked to this distributor yet.</div> : dealers.map((d) => <div className="dealer-row" key={d.user_id}><div className="avatar">{String(d.store_name || "D").slice(0,2).toUpperCase()}</div><div className="dealer-details"><strong>{d.store_name || "Unnamed shop"}</strong><small>{[d.contact_name,d.address,d.city].filter(Boolean).join(" · ")}</small></div><span className={`status status-${String(d.review_status).replaceAll("_","-")}`}>{String(d.review_status).replaceAll("_"," ")}</span>{d.review_status === "pending" ? <div className="row-actions"><button className="accept-btn" onClick={()=>reviewDealer(d.user_id,"approved")} title="Approve dealer"><Check size={15}/></button><button className="reject-btn" onClick={()=>reviewDealer(d.user_id,"rejected")} title="Reject dealer"><X size={15}/></button></div> : <span className="table-time">—</span>}</div>)}</section>}
        {role === "dealer" && page === "My Orders" && <section className="panel full-panel"><div className="panel-head"><div><h2>Your orders</h2><p>Follow each order from placement to delivery.</p></div></div>{orderError && <p className="login-error">{orderError}</p>}{ordersLoading ? <p className="helper-note">Loading your orders…</p> : <OrderTable orders={orders} updateOrder={updateOrder} dealerMode/>}</section>}
        {role === "distributor" && page === "Settings" && <section className="settings-layout" aria-label="Distributor settings">
          <article className="panel settings-card">
            <div className="settings-card-heading"><span className="settings-card-icon"><Building2 size={19}/></span><div><h2>Workspace & account</h2><p>Identity and access information for this distributor workspace.</p></div></div>
            <div className="settings-detail-list">
              <div className="settings-detail-row"><div><strong>Workspace</strong><small>Your business management area</small></div><span>Distributor Admin</span></div>
              <div className="settings-detail-row"><div><strong>Account type</strong><small>Permissions assigned to this account</small></div><span>Distributor administrator</span></div>
              <div className="settings-detail-row"><div><strong>Authentication</strong><small>Identity and sign-in provider</small></div><span>Supabase Auth</span></div>
            </div>
            <div className="settings-info-note"><ShieldCheck size={17}/><p>Your administrator account is separate from dealer accounts. Workspace permissions are determined by your verified account profile.</p></div>
          </article>
          <article className="panel settings-card settings-security-card">
            <div className="settings-card-heading"><span className="settings-card-icon security"><ShieldCheck size={19}/></span><div><h2>Sign-in & security</h2><p>Manage the session on this device.</p></div></div>
            <div className="settings-security-status"><span className="settings-security-dot"/><div><strong>Workspace connected</strong><small>Your current session is active.</small></div></div>
            <div className="settings-security-copy">Use sign out when you finish on a shared or public computer. You can sign in again with your distributor administrator credentials.</div>
            <button className="btn btn-outline settings-signout" onClick={async () => { const supabase=getSupabaseBrowserClient(); if(supabase) await supabase.auth.signOut(); setSignedIn(false); setLoginPassword(""); setLoginError(""); }}>Sign out of this device <ArrowUpRight size={15}/></button>
          </article>
        </section>}
        {role === "dealer" && page === "My Account" && <section className="panel account-panel"><div className="panel-head"><div><h2>Shop profile</h2><p>Details used for order and delivery updates.</p></div></div><label className="form-label">Shop / store name<input value={dealerName} onChange={e=>setDealerName(e.target.value)} /></label><label className="form-label">Contact name<input defaultValue="Shop Owner" /></label><label className="form-label">Mobile number<input placeholder="Enter mobile number" /></label><label className="form-label">Delivery address<textarea placeholder="Shop address, area, city and PIN code" rows={3}/></label><button className="btn btn-primary" onClick={()=>flash("Profile editing is temporarily disabled until the database profile editor is ready.")}>Save profile</button></section>}
        <footer className="footer"><span>© 2026 SupplyDesk <span className="footer-dot">·</span> Built for better distribution.</span><span><i/> Connected workspace</span></footer>
      </div>
    </main>
    {showCart && <div className="modal-backdrop" onClick={()=>setShowCart(false)}><section className="cart-drawer" onClick={e=>e.stopPropagation()}><div className="drawer-head"><div><span className="eyebrow">DEALER ORDER</span><h2>Your cart <span>({cartCount})</span></h2></div><button className="icon-btn" onClick={()=>setShowCart(false)} aria-label="Close cart"><X size={20}/></button></div>{cart.length===0?<div className="empty-cart"><div className="empty-cart-icon"><ShoppingCart size={25}/></div><h3>Your cart is empty</h3><p>Choose products from the catalogue to build your order.</p><button className="btn btn-primary" onClick={()=>{setShowCart(false);setPage(role === "distributor" ? "Products & Stock" : "Product Catalogue");}}>Browse products</button></div>:<><div className="cart-items">{cart.map(line=><div className="cart-line" key={line.product.id}><div className={`cart-product-icon ${line.product.color}`}>{line.product.mark}</div><div className="cart-line-info"><strong>{line.product.name}</strong><small>{money(line.product.price)} / {line.product.unit}</small><div className="quantity-control"><button onClick={()=>add(line.product,-1)} aria-label="Decrease quantity"><Minus size={13}/></button><span>{line.qty}</span><button onClick={()=>add(line.product,1)} aria-label="Increase quantity"><Plus size={13}/></button></div></div><strong className="line-total">{money(line.qty*line.product.price)}</strong><button className="remove-line" onClick={()=>setCart(old=>old.filter(x=>x.product.id!==line.product.id))} aria-label="Remove product"><X size={15}/></button></div>)}</div><div className="checkout-area"><div className="checkout-note"><CheckCircle2 size={16}/> Stock is checked again when your order is submitted.</div><div className="checkout-total"><span>Order total</span><strong>{money(cartTotal)}</strong></div><div className="checkout-total muted-total"><span>Total cartons / boxes</span><strong>{cartCount}</strong><span className="cart-piece-total">Total individual pieces</span><strong>{cart.reduce((n, line) => n + line.qty * line.product.piecesPerCarton, 0)}</strong></div><button className="btn btn-primary checkout-btn" onClick={placeOrder} disabled={orderBusy}>{orderBusy ? "Placing order…" : "Place order"} <ChevronRight size={17}/></button><p className="demo-warning">Your order will be saved securely and sent to your distributor.</p></div></>}</section></div>}
    {notice && <div className="toast"><CheckCircle2 size={18}/>{notice}<button onClick={()=>setNotice("")} aria-label="Dismiss notification"><X size={15}/></button></div>}
  </div>;
}

function Metric({label,value,change,icon,tone}:{label:string;value:string;change:string;icon:string;tone:string}) { return <article className="metric-card"><div className="metric-top"><span>{label}</span><div className={`metric-icon ${tone}`}>{icon}</div></div><div className="metric-value">{value}</div><div className="metric-change"><span className={`change-dot ${tone}`}/>{change}</div></article>; }
function QuickAction({icon,title,detail,onClick}:{icon:React.ReactNode;title:string;detail:string;onClick:()=>void}) { return <button className="quick-action" onClick={onClick}><div className="quick-icon">{icon}</div><div><strong>{title}</strong><small>{detail}</small></div><ChevronRight size={17} className="quick-chevron"/></button>; }
function OrderTable({orders,updateOrder,dealerMode=false}:{orders:WholesaleOrder[];updateOrder:(id:string,status:string,reason?:string)=>void;dealerMode?:boolean}) {
  return <div className="table-scroll"><table className="orders-table"><thead><tr><th>ORDER</th><th>{dealerMode?"YOUR SHOP":"DEALER"}</th><th>ORDERED ITEMS / PIECES</th><th>ORDER VALUE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td><strong className="order-id">{o.orderNumber}</strong><small className="table-time">{o.time}</small></td><td><div className="table-dealer"><strong>{o.dealer}</strong><small>{o.area}</small></div></td><td><strong>{o.pieces} pieces</strong><small className="table-time">{o.products.join(" · ")}</small></td><td><strong>{money(o.amount)}</strong></td><td><span className={`status status-${o.status.toLowerCase().replaceAll(" ","-")}`}>{o.status}</span>{o.cancelReason && <small className="table-time">Reason: {o.cancelReason}</small>}</td><td>{dealerMode?(o.status==="Pending"?<button className="reject-btn cancel-order-btn" onClick={()=>{const reason=window.prompt("Why are you cancelling this order?");if(reason?.trim())updateOrder(o.id,"Cancelled",reason.trim());}}>Cancel</button>:o.status==="Accepted"||o.status==="Processing"?<button className="reject-btn cancel-order-btn" onClick={()=>{const reason=window.prompt("Why are you requesting cancellation?");if(reason?.trim())updateOrder(o.id,"Cancellation Requested",reason.trim());}}>Request cancel</button>:<span className="table-time">{o.status==="Delivered"?"Completed":o.status==="Cancellation Requested"?"Awaiting review":o.status==="Cancelled"?"Cancelled":"Track order"}</span>):o.status==="Pending"?<div className="row-actions"><button className="accept-btn" onClick={()=>updateOrder(o.id,"Accepted")} title="Confirm order"><Check size={15}/></button><button className="reject-btn" onClick={()=>updateOrder(o.id,"Rejected")} title="Reject order"><X size={15}/></button></div>:o.status==="Cancellation Requested"?<div className="row-actions"><button className="accept-btn" onClick={()=>updateOrder(o.id,"Cancelled")} title="Approve cancellation"><Check size={15}/></button><button className="reject-btn" onClick={()=>updateOrder(o.id,"Cancellation Rejected")} title="Decline cancellation"><X size={15}/></button></div>:o.status==="Accepted"||o.status==="Processing"?<button className="deliver-btn" onClick={()=>updateOrder(o.id,o.status==="Accepted"?"Processing":"Out for Delivery")}>{o.status==="Accepted"?"Prepare":"Dispatch"}</button>:o.status==="Out for Delivery"?<button className="deliver-btn" onClick={()=>updateOrder(o.id,"Delivered")}>Mark delivered</button>:<span className="table-time">—</span>}</td></tr>)}</tbody></table>{orders.length===0&&<div className="empty-table"><ClipboardList size={25}/><p>No real orders yet. Orders placed by dealers will appear here.</p></div>}</div>;
}
