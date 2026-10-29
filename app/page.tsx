"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Bell, Search, ShoppingCart, Package, LayoutDashboard, ClipboardList, Boxes, Users, FileSpreadsheet, Settings, Plus, Minus, Check, Truck, ChevronRight, Menu, X, CircleUserRound, ArrowUpRight, CheckCircle2, AlertTriangle, Store as StoreIcon } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Product = { id: string | number; name: string; category: string; brand: string; sku: string; unit: string; piecesPerCarton: number; minOrder: number; price: number; stock: number; color: string; mark: string; imagePath?: string; isActive?: boolean; reservedStock?: number };
type ProductDraft = { name: string; sku: string; brand: string; category: string; unit: string; piecesPerUnit: string; minimumOrderQuantity: string; price: string; stock: string; imageUrl: string };
type CartLine = { product: Product; qty: number };
const initialOrders = [
  { id: "ORD-1048", dealer: "Shree Ganesh Stores", area: "Kothrud, Pune", items: 3, pieces: 72, products: ["Royal White Dinner Plate × 2 cartons", "Crystal Water Glass × 1 carton"], cancelReason: "", amount: 2640, status: "Pending", time: "2 min ago" },
  { id: "ORD-1047", dealer: "Sai Home & Kitchen", area: "Bibwewadi, Pune", items: 2, pieces: 48, products: ["Melamine Serving Tray × 1 carton", "Kitchen Canister Set × 3 boxes"], cancelReason: "", amount: 2760, status: "Accepted", time: "18 min ago" },
  { id: "ORD-1046", dealer: "Om Housewares", area: "Dhankawadi, Pune", items: 4, pieces: 96, products: ["Ceramic Dinner Set × 4 cartons"], cancelReason: "", amount: 9600, status: "Delivered", time: "Today, 10:42 AM" },
  { id: "ORD-1045", dealer: "Patil Crockery Centre", area: "Katraj, Pune", items: 2, pieces: 30, products: ["Ceramic Tea Cup Set × 2 boxes", "Glass Storage Jar Set × 1 box"], cancelReason: "", amount: 1560, status: "Processing", time: "Today, 9:18 AM" }
];
const money = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export default function Home() {
  const [role, setRole] = useState<"distributor" | "dealer">("distributor");
  const [signedIn, setSignedIn] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
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
  const [authBusy, setAuthBusy] = useState(false);
  const [page, setPage] = useState("Overview");
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productError, setProductError] = useState("");
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [productSaving, setProductSaving] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | number | null>(null);
  const emptyProductDraft: ProductDraft = { name: "", sku: "", brand: "", category: "", unit: "carton", piecesPerUnit: "1", minimumOrderQuantity: "1", price: "", stock: "0", imageUrl: "" };
  const [productDraft, setProductDraft] = useState<ProductDraft>(emptyProductDraft);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All products");
  const [orders, setOrders] = useState(initialOrders);
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
        const savedOrders = window.localStorage.getItem("supplydesk-demo-orders");
        if (savedOrders) { const parsed = JSON.parse(savedOrders); if (Array.isArray(parsed)) setOrders(parsed); }
        const savedCart = window.localStorage.getItem("supplydesk-demo-cart");
        if (savedCart) { const parsed = JSON.parse(savedCart); if (Array.isArray(parsed)) setCart(parsed); }
      } catch (error) {
        console.error("Could not restore SupplyDesk data", error);
      } finally {
        if (active) setStorageReady(true);
      }
    };
    void restore();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem("supplydesk-demo-orders", JSON.stringify(orders));
      window.localStorage.setItem("supplydesk-demo-cart", JSON.stringify(cart));
    } catch (error) {
      console.error("Could not save demo cart state", error);
    }
  }, [storageReady, orders, cart]);

  const cartCount = cart.reduce((n, line) => n + line.qty, 0);
  const cartTotal = cart.reduce((n, line) => n + line.qty * line.product.price, 0);
  const productCategories = useMemo(() => ["All products", ...Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort((a,b)=>a.localeCompare(b))], [products]);
  const filtered = useMemo(() => products.filter(p => (category === "All products" || p.category === category) && `${p.name} ${p.sku} ${p.category} ${p.brand}`.toLowerCase().includes(search.toLowerCase())), [products, category, search]);

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
          supabase.from("products").select("id,category_id,sku,name,brand,description,image_path,unit_label,pieces_per_unit,minimum_order_quantity,price,stock_on_hand,stock_reserved,is_active")
        ]);
        if (categoryLoadError) throw categoryLoadError;
        if (productLoadError) throw productLoadError;
        if (!active) return;
        const names = new Map((categoryRows || []).map((row: any) => [row.id, row.name]));
        const palette = ["sage", "blue", "coral", "sand", "mint", "plum", "gold", "orange"];
        setProducts((productRows || []).map((row: any, index: number) => ({
          id: row.id,
          name: row.name,
          category: names.get(row.category_id) || "Uncategorised",
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
          imagePath: row.image_path || "",
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
  }, [signedIn, role]);
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
      imageUrl: product.imagePath || ""
    });
    setProductError("");
    setProductFormOpen(true);
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
    if (!Number.isInteger(piecesPerUnit) || piecesPerUnit < 1 || !Number.isInteger(minimumOrderQuantity) || minimumOrderQuantity < 1 || !Number.isInteger(stock) || stock < 0 || !Number.isFinite(price) || price < 0) {
      setProductError("Check price, stock, pack size and minimum order values.");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setProductError("Supabase is not configured for this deployment."); return; }
    setProductSaving(true);
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
      const productPayload = {
        distributor_id: distributor.id,
        category_id: categoryId,
        sku,
        name,
        brand: brand || null,
        image_path: productDraft.imageUrl.trim() || null,
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
      const savedProduct: Product = {
        id: savedId, name, category: categoryName, brand, sku, unit,
        piecesPerCarton: piecesPerUnit, minOrder: minimumOrderQuantity,
        price, stock, color: "sage", mark: "◉",
        imagePath: productDraft.imageUrl.trim(), isActive: true,
        reservedStock: currentEditingProduct?.reservedStock || 0
      };
      setProducts(old => editingProductId === null ? [savedProduct, ...old] : old.map(p => p.id === editingProductId ? savedProduct : p));
      setCategory(categoryName);
      setProductDraft(emptyProductDraft);
      setProductFormOpen(false);
      setEditingProductId(null);
      flash(editingProductId === null ? "Product saved to the live catalogue." : "Product changes saved.");
    } catch (error) {
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
  const updateOrder = (id: string, status: string, reason = "") => { setOrders(old => old.map(o => o.id === id ? { ...o, status, cancelReason: reason || o.cancelReason } : o)); flash(`${id}: ${status === "Cancellation requested" ? "cancellation request sent to distributor" : status === "Cancelled" ? "order cancelled" : `status updated to ${status.toLowerCase()}`}.`); };
  const placeOrder = () => { if (role !== "dealer" || !cart.length) return; const id = `ORD-${1049 + orders.length - 4}`; const order = { id, dealer: dealerName, area: "Pune, Maharashtra", items: cart.length, pieces: cart.reduce((n, line) => n + line.qty * line.product.piecesPerCarton, 0), products: cart.map(line => `${line.product.name} × ${line.qty} ${line.product.unit}${line.qty > 1 ? "s" : ""}`), cancelReason: "", amount: cartTotal, status: "Pending", time: "Just now" }; setOrders(old => [order, ...old]); setCart([]); setShowCart(false); setPage("My Orders"); flash(`Order ${id} placed. Waiting for distributor confirmation (demo).`); };
  const navItems = role === "distributor" ? [{ name: "Overview", icon: LayoutDashboard }, { name: "Orders", icon: ClipboardList }, { name: "Products & Stock", icon: Boxes }, { name: "Dealers", icon: Users }, { name: "Sales & Excel", icon: FileSpreadsheet }] : [{ name: "Product Catalogue", icon: Package }, { name: "My Orders", icon: ClipboardList }, { name: "My Account", icon: CircleUserRound }];
  const selectPage = (name: string) => { setPage(name); setMobileNav(false); if (name === "My Cart") setShowCart(true); };
  const csvExport = () => { const rows = [["Order ID", "Dealer", "Area", "Products", "Total Pieces", "Order Value (INR)", "Status", "Order Time"], ...orders.filter(o => o.status === "Delivered").map(o => [o.id, o.dealer, o.area, o.products.join("; "), o.pieces, o.amount, o.status, o.time])]; const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\r\n"); const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "wholesale-sales-report.csv"; a.click(); URL.revokeObjectURL(url); flash("Sales report exported. Open the CSV file in Excel."); };
  const title = page === "Overview" ? "Good morning, Distributor" : page;
  const isCatalogue = page === "Product Catalogue" || page === "Products & Stock" || page === "Overview";
  if (!signedIn) return <main className="login-screen">
    <section className="login-card">
      <div className="login-brand"><div className="brand-mark">s<span>.</span></div><div><strong>supplydesk</strong><small>WHOLESALE HOMEWARE</small></div></div>
      <div className="login-kicker">BUSINESS PORTAL</div>
      <h1>{resetMode ? "Set a new password" : authMode === "login" ? "Sign in to your workspace" : "Create your account"}</h1>
      <p className="login-intro">{resetMode ? "Choose a new password of at least 8 characters." : loginRole === "distributor" ? "Private administrator access." : "Sign in to place and track your wholesale orders."}</p>
      {loginRole === "distributor" && !resetMode && <p className="login-note">Administrator sign-in · use your separate admin account.</p>}
      {!resetMode && <div className="login-role-tabs">
        <button type="button" className={authMode === "login" ? "chosen" : ""} onClick={() => { setAuthMode("login"); setLoginError(""); setAuthNotice(""); }}>Login</button>
        {loginRole === "dealer" && <button type="button" className={authMode === "signup" ? "chosen" : ""} onClick={() => { setAuthMode("signup"); setLoginError(""); setAuthNotice(""); }}>Create account</button>}
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
          if (loginRole === "distributor") { setLoginError("For security, the single distributor-owner account must be provisioned through a protected setup. Public distributor registration is disabled."); return; }
          if (!signupName.trim() || !signupBusiness.trim() || !signupAddress.trim() || !signupCity.trim() || !loginEmail.trim() || loginPassword.length < 8) { setLoginError("Complete all fields and use a password of at least 8 characters."); return; }
          setAuthBusy(true);
          try {
            const { data, error } = await supabase.auth.signUp({ email: loginEmail.trim(), password: loginPassword, options: { data: { full_name: signupName.trim(), role: "dealer", store_name: signupBusiness.trim(), contact_name: signupName.trim(), address: signupAddress.trim(), city: signupCity.trim() } } });
            if (error) throw error;
            setLoginShop(signupBusiness.trim());
            if (data.session && data.user) {
              // A dealer can enter the catalogue immediately; approval is not a login gate.
              setDealerName(signupBusiness.trim());
              setReviewStatus("pending");
              setRole("dealer");
              setPage("Product Catalogue");
              setSignedIn(true);
              setLoginPassword("");
              setLoginError("");
              flash("Account created. You are signed in.");
            } else {
              // With email confirmation enabled, no session exists until the user verifies.
              setLoginError("Account created. Check your inbox (and spam folder) to confirm your email, then sign in. No distributor approval is required to log in.");
              setAuthMode("login");
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : "Could not create account.";
            const normalized = message.toLowerCase();
            if (normalized.includes("already registered") || normalized.includes("already exists") || normalized.includes("user already")) {
              setAuthMode("login");
              setLoginError("This email already has an account. Use Login with the same password, or choose Forgot password if you need to reset it.");
            } else {
              setLoginError(message);
            }
          }
          finally { setAuthBusy(false); }
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
          {authMode === "signup" && loginRole === "dealer" && <>
            <label>Full name<input value={signupName} onChange={e=>setSignupName(e.target.value)} placeholder="Your full name" required/></label>
            <label>Shop / business name<input value={signupBusiness} onChange={e=>setSignupBusiness(e.target.value)} placeholder="Your shop name" required/></label>
            <label>Business address<input value={signupAddress} onChange={e=>setSignupAddress(e.target.value)} placeholder="Street and area" required/></label>
            <label>City<input value={signupCity} onChange={e=>setSignupCity(e.target.value)} required/></label>
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
          <button className="login-submit" type="submit" disabled={authBusy}>{authBusy ? "Please wait…" : authMode === "signup" ? "Create Dealer account" : loginRole === "distributor" ? "Sign in to Admin" : "Sign in"} <ChevronRight size={17}/></button>
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
      <p className="login-note">Single-distributor setup · Dealer accounts are separate from the distributor account.</p>
      <p className="login-demo-note">Dealer accounts can sign in whenever they want. Distributor approval is not required for login.</p>
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
      <div className="sidebar-bottom"><div className="help-card"><div className="help-dot"/><strong>Need a hand?</strong><p>Our support team is here to help your business run smoothly.</p><button onClick={() => flash("Support contact: add distributor support details in settings.")}>Contact support <ArrowUpRight size={14}/></button></div><button className="nav-item settings" onClick={() => selectPage(role === "dealer" ? "My Account" : "Settings")}><Settings size={18}/>Settings</button><div className="user-mini"><div className="avatar">{role === "distributor" ? "AD" : "SG"}</div><div className="user-info"><strong>{role === "distributor" ? "Admin Distributor" : dealerName}</strong><small>{role === "distributor" ? "Distributor account" : "Approved dealer · Demo"}</small></div><span className="online-dot"/></div></div>
    </aside>
    {mobileNav && <button className="scrim" onClick={() => setMobileNav(false)} aria-label="Close menu"/>}
    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="icon-btn mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={20}/></button><div className="breadcrumb">Workspace <ChevronRight size={14}/> <strong>{page}</strong></div></div><div className="top-actions"><div className="status-pill"><span/> System operational</div><button className="icon-btn notification-btn" onClick={() => { setPage(role === "distributor" ? "Orders" : "My Orders"); }} aria-label="View notifications"><Bell size={19}/>{orders.some(o => o.status === "Pending") && <i/>}</button><div className="top-avatar">{role === "distributor" ? "AD" : "SG"}</div></div></header>
      <div className="content-wrap">
        <section className="page-heading"><div><div className="eyebrow">{role === "distributor" ? "DISTRIBUTOR WORKSPACE" : "DEALER WORKSPACE"} <span className="live-tag"><span/> LIVE DEMO</span></div><h1>{role === "distributor" && page === "Overview" ? <>Good morning, <em>Distributor.</em></> : title}</h1><p>{role === "distributor" ? (page === "Overview" ? "Here's what's happening with your distribution business today." : page === "Orders" ? "Review incoming orders and keep every delivery moving." : page === "Products & Stock" ? "Manage wholesale products, brands, carton quantities, prices and stock." : page === "Sales & Excel" ? "Review delivered sales and export reports for your records." : "Manage dealer access and account details.") : (page === "Product Catalogue" ? "Order crockery, glassware, kitchenware and homeware by carton or box." : page === "My Orders" ? "Track your orders from confirmation through delivery." : "Manage your shop details and orders.")}</p></div><div className="heading-actions">{role === "dealer" && <button className="btn btn-primary" onClick={() => setShowCart(true)}><ShoppingCart size={16}/> Cart <span className="button-count">{cartCount}</span></button>}{role === "distributor" && page === "Products & Stock" && <button className="btn btn-primary" onClick={() => flash("Connect the database to add and save real products.")}><Plus size={17}/> Add product</button>}{role === "distributor" && page === "Sales & Excel" && <button className="btn btn-primary" onClick={csvExport}><FileSpreadsheet size={16}/> Export Excel CSV</button>}</div></section>
        {role === "distributor" && page === "Overview" && <>
          <section className="metric-grid"><Metric label="Total sales" value={money(orders.filter(o => o.status === "Delivered").reduce((n,o) => n + o.amount, 0))} change="Delivered orders" icon="₹" tone="green"/><Metric label="Orders to review" value={String(orders.filter(o => o.status === "Pending").length).padStart(2,"0")} change="Needs your attention" icon="↗" tone="orange"/><Metric label="Active products" value={String(products.length).padStart(2,"0")} change="Crockery, glassware & more" icon="▦" tone="purple"/><Metric label="Low stock items" value={String(products.filter(p => p.stock < 20).length).padStart(2,"0")} change="Restock recommended" icon="!" tone="red"/></section>
          <section className="feature-banner"><div className="banner-symbol"><Package size={23}/></div><div className="banner-copy"><span>YOUR BUSINESS, IN SYNC</span><h2>Every order. One clear picture.</h2><p>Orders, inventory and sales reports come together in one workspace.</p></div><div className="banner-art"><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="art-box"><Package size={32}/></div><div className="art-chip chip-one"><Check size={13}/> Stock synced</div><div className="art-chip chip-two"><Truck size={14}/> On its way</div></div></section>
          <section className="dashboard-grid"><div className="panel orders-panel"><div className="panel-head"><div><h2>Recent orders</h2><p>Latest activity from your dealers</p></div><button className="text-link" onClick={() => setPage("Orders")}>View all <ChevronRight size={15}/></button></div><OrderTable orders={orders.slice(0,4)} updateOrder={updateOrder}/></div><div className="panel inventory-panel"><div className="panel-head"><div><h2>Stock overview</h2><p>Inventory that needs a look</p></div><button className="icon-btn subtle" onClick={() => setPage("Products & Stock")} aria-label="View stock"><ArrowUpRight size={17}/></button></div><div className="stock-summary"><div><span className="stock-number">{products.reduce((n,p)=>n+p.stock,0).toLocaleString("en-IN")}</span><small>Cartons / boxes in stock</small></div><div className="stock-progress"><span style={{width:"74%"}}/></div><div className="stock-foot"><span><i className="legend-dot green-dot"/> In stock</span><strong>{products.filter(p=>p.stock>=20).length} products</strong></div><div className="stock-foot"><span><i className="legend-dot orange-dot"/> Low stock</span><strong>{products.filter(p=>p.stock<20).length} products</strong></div></div><div className="low-stock-list">{products.filter(p=>p.stock<50).slice(0,3).map(p=><div className="low-stock-row" key={p.id}><div className={`tiny-product ${p.color}`}>{p.mark}</div><div className="low-product-name"><strong>{p.name}</strong><small>{p.sku}</small></div><span className={p.stock<20?"stock-badge danger":"stock-badge warning"}>{p.stock} left</span></div>)}</div></div></section>
          <section className="panel quick-panel"><div className="panel-head"><div><h2>Quick actions</h2><p>Get to the things you do most</p></div></div><div className="quick-actions"><QuickAction icon={<ClipboardList size={19}/>} title="Review new orders" detail="Accept or reject dealer orders" onClick={()=>setPage("Orders")}/><QuickAction icon={<Boxes size={19}/>} title="Manage inventory" detail="Update products and stock" onClick={()=>setPage("Products & Stock")}/><QuickAction icon={<FileSpreadsheet size={19}/>} title="Export sales report" detail="Download delivered sales" onClick={csvExport}/></div></section>
        </>}
        {role === "distributor" && page === "Orders" && <section className="panel full-panel"><div className="panel-head"><div><h2>All orders</h2><p>Accept, process and complete dealer orders.</p></div><span className="soft-count">{orders.length} orders</span></div><OrderTable orders={orders} updateOrder={updateOrder}/></section>}
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
              <label>Pieces per unit *<input type="number" min="1" step="1" value={productDraft.piecesPerUnit} onChange={e=>setProductDraft(v=>({...v,piecesPerUnit:e.target.value}))} required/></label>
              <label>Minimum order quantity *<input type="number" min="1" step="1" value={productDraft.minimumOrderQuantity} onChange={e=>setProductDraft(v=>({...v,minimumOrderQuantity:e.target.value}))} required/></label>
              <label>Wholesale price per unit (₹) *<input type="number" min="0" step="0.01" value={productDraft.price} onChange={e=>setProductDraft(v=>({...v,price:e.target.value}))} placeholder="0.00" required/></label>
              <label>Available stock (units) *<input type="number" min="0" step="1" value={productDraft.stock} onChange={e=>setProductDraft(v=>({...v,stock:e.target.value}))} required/></label>
              <label className="product-image-field">Product image URL<input type="url" value={productDraft.imageUrl} onChange={e=>setProductDraft(v=>({...v,imageUrl:e.target.value}))} placeholder="https://..." /></label>
            </div>
            <div className="product-form-actions"><button className="btn btn-primary" type="submit" disabled={productSaving}>{productSaving ? "Saving…" : editingProductId === null ? "Save product" : "Save changes"}</button><button className="btn btn-outline" type="button" disabled={productSaving} onClick={()=>{setProductFormOpen(false);setEditingProductId(null);setProductDraft(emptyProductDraft);setProductError("");}}>Cancel</button></div>
          </form>}
          <div className="product-admin-footer"><span>{products.length} products saved in your catalogue</span><span>Saved products are shared with the assigned dealer catalogue subject to database access rules.</span></div>
        </section>}
        {isCatalogue && (page !== "Overview" || role === "dealer") && <section className="catalogue-section">
          <div className="catalogue-toolbar"><div className="search-box"><Search size={17}/><input placeholder="Search products or SKU..." value={search} onChange={e=>setSearch(e.target.value)}/>{search && <button onClick={()=>setSearch("")} aria-label="Clear search"><X size={14}/></button>}</div>{role === "dealer" && <button className="btn btn-outline cart-toolbar" onClick={()=>setShowCart(true)}><ShoppingCart size={16}/> Cart ({cartCount})</button>}</div>
          <div className="category-row">{productCategories.map(c=><button key={c} className={category===c?"category-chip active":"category-chip"} onClick={()=>setCategory(c)}>{c}</button>)}</div>
          {productError && role === "dealer" && <div className="empty-state"><AlertTriangle size={26}/><h3>Could not load the catalogue</h3><p>{productError}</p></div>}
          {productsLoading ? <div className="empty-state"><Package size={28}/><h3>Loading catalogue</h3><p>Checking products saved in your business account.</p></div> : <><div className="product-grid">{filtered.map(p=><article className="product-card" key={p.id}><div className={`product-visual ${p.color}`}><span className="product-category">{p.category}</span>{p.imagePath ? <img className="product-image" src={p.imagePath} alt={p.name} loading="lazy"/> : <div className="product-illustration">{p.mark}</div>}<span className={p.stock<20?"stock-label low":"stock-label"}>{p.stock<1?"Out of stock":p.stock<20?"Low stock":`${p.stock} ${p.unit}s in stock`}</span></div><div className="product-info"><div className="sku">{p.brand ? p.brand+" · " : ""}SKU {p.sku}</div><h3>{p.name}</h3><p>{p.piecesPerCarton} pieces per {p.unit} · Min. {p.minOrder}</p><div className="product-buy"><div><strong>{money(p.price)}</strong><small>per {p.unit.toLowerCase()}</small></div>{role === "dealer" ? <button className="add-btn" disabled={p.stock<p.minOrder} onClick={()=>{add(p,p.minOrder);flash(`${p.name} added to cart`);}}><Plus size={16}/> Add</button> : <button className="btn btn-outline product-edit-btn" type="button" onClick={()=>startEditProduct(p)}><Settings size={14}/> Edit</button>}</div>{role === "dealer" && cart.some(x=>x.product.id===p.id) && <div className="inline-quantity"><button onClick={()=>add(p,-1)} aria-label="Decrease quantity"><Minus size={13}/></button><span>{cart.find(x=>x.product.id===p.id)?.qty} in cart</span><button onClick={()=>add(p,1)} aria-label="Increase quantity"><Plus size={13}/></button></div>}</div></article>)}</div>{filtered.length===0&&<div className="empty-state"><Package size={30}/><h3>{productsLoading ? "Loading products" : search || category !== "All products" ? "No products found" : "No products yet"}</h3><p>{search || category !== "All products" ? "Try another search or category." : role === "distributor" ? "Select Add product above to publish your first item." : "Your distributor has not published products yet."}</p>{role === "distributor" && page === "Products & Stock" && <button className="btn btn-primary" onClick={startNewProduct}><Plus size={16}/> Add product</button>}</div>}</>}
        </section>}
        {role === "distributor" && page === "Sales & Excel" && <section className="panel full-panel"><div className="panel-head"><div><h2>Delivered sales ledger</h2><p>Only delivered orders count as completed sales in this demo.</p></div><button className="btn btn-primary" onClick={csvExport}><FileSpreadsheet size={16}/> Export CSV for Excel</button></div><div className="sales-summary"><div><span>Completed sales value</span><strong>{money(orders.filter(o=>o.status==="Delivered").reduce((n,o)=>n+o.amount,0))}</strong></div><div><span>Delivered orders</span><strong>{orders.filter(o=>o.status==="Delivered").length}</strong></div><div><span>Pieces delivered</span><strong>{orders.filter(o=>o.status==="Delivered").reduce((n,o)=>n+o.pieces,0)}</strong></div></div><OrderTable orders={orders.filter(o=>o.status==="Delivered")} updateOrder={updateOrder}/><p className="helper-note"><AlertTriangle size={15}/> Demo data only. Production sales records must be stored in the database and exported from verified delivered order items.</p></section>}
        {role === "distributor" && page === "Dealers" && <section className="panel full-panel"><div className="panel-head"><div><h2>Dealer accounts</h2><p>Example dealer records for the interface preview.</p></div><button className="btn btn-outline" onClick={()=>flash("Dealer invitations require backend setup.")}><Plus size={16}/> Invite dealer</button></div><div className="dealer-row"><div className="avatar">SG</div><div className="dealer-details"><strong>Shree Ganesh Stores</strong><small>Kothrud, Pune · dealer@example.com</small></div><span className="status status-accepted">Approved</span><button className="icon-btn subtle" onClick={()=>flash("Connect Supabase to manage dealer accounts.")}><ChevronRight size={17}/></button></div><div className="dealer-row"><div className="avatar avatar-blue">SP</div><div className="dealer-details"><strong>Sai Provision Store</strong><small>Bibwewadi, Pune · dealer@example.com</small></div><span className="status status-pending">Pending review</span><button className="btn btn-outline small-btn" onClick={()=>flash("Dealer approval will be saved once backend is connected.")}>Review</button></div></section>}
        {role === "dealer" && page === "My Orders" && <section className="panel full-panel"><div className="panel-head"><div><h2>Your orders</h2><p>Follow each order from placement to delivery.</p></div></div><OrderTable orders={orders.filter(o=>o.dealer===dealerName)} updateOrder={updateOrder} dealerMode/></section>}
        {role === "distributor" && page === "Settings" && <section className="panel account-panel"><div className="panel-head"><div><h2>Account settings</h2><p>Administrator access and workspace information.</p></div></div><div className="account-setting-row"><span>Workspace</span><strong>Distributor Admin</strong></div><div className="account-setting-row"><span>Authentication</span><strong>Supabase account</strong></div><p className="login-note">Your administrator login is separate from dealer accounts. Business and catalogue setup is managed through the configured distributor record.</p><button className="btn btn-outline account-signout" onClick={async () => { const supabase=getSupabaseBrowserClient(); if(supabase) await supabase.auth.signOut(); setSignedIn(false); setLoginPassword(""); setLoginError(""); }}>Sign out</button></section>}
        {role === "dealer" && page === "My Account" && <section className="panel account-panel"><div className="panel-head"><div><h2>Shop profile</h2><p>Details used for order and delivery updates.</p></div></div><label className="form-label">Shop / store name<input value={dealerName} onChange={e=>setDealerName(e.target.value)} /></label><label className="form-label">Contact name<input defaultValue="Shop Owner" /></label><label className="form-label">Mobile number<input placeholder="Enter mobile number" /></label><label className="form-label">Delivery address<textarea placeholder="Shop address, area, city and PIN code" rows={3}/></label><button className="btn btn-primary" onClick={()=>flash("Profile changes are local to this demo; connect backend to save.")}>Save profile</button></section>}
        <footer className="footer"><span>© 2026 SupplyDesk <span className="footer-dot">·</span> Built for better distribution.</span><span><i/> All systems in demo</span></footer>
      </div>
    </main>
    {showCart && <div className="modal-backdrop" onClick={()=>setShowCart(false)}><section className="cart-drawer" onClick={e=>e.stopPropagation()}><div className="drawer-head"><div><span className="eyebrow">DEALER ORDER</span><h2>Your cart <span>({cartCount})</span></h2></div><button className="icon-btn" onClick={()=>setShowCart(false)} aria-label="Close cart"><X size={20}/></button></div>{cart.length===0?<div className="empty-cart"><div className="empty-cart-icon"><ShoppingCart size={25}/></div><h3>Your cart is empty</h3><p>Choose products from the catalogue to build your order.</p><button className="btn btn-primary" onClick={()=>{setShowCart(false);setPage(role === "distributor" ? "Products & Stock" : "Product Catalogue");}}>Browse products</button></div>:<><div className="cart-items">{cart.map(line=><div className="cart-line" key={line.product.id}><div className={`cart-product-icon ${line.product.color}`}>{line.product.mark}</div><div className="cart-line-info"><strong>{line.product.name}</strong><small>{money(line.product.price)} / {line.product.unit}</small><div className="quantity-control"><button onClick={()=>add(line.product,-1)} aria-label="Decrease quantity"><Minus size={13}/></button><span>{line.qty}</span><button onClick={()=>add(line.product,1)} aria-label="Increase quantity"><Plus size={13}/></button></div></div><strong className="line-total">{money(line.qty*line.product.price)}</strong><button className="remove-line" onClick={()=>setCart(old=>old.filter(x=>x.product.id!==line.product.id))} aria-label="Remove product"><X size={15}/></button></div>)}</div><div className="checkout-area"><div className="checkout-note"><CheckCircle2 size={16}/> Stock is checked again when your order is submitted.</div><div className="checkout-total"><span>Order total</span><strong>{money(cartTotal)}</strong></div><div className="checkout-total muted-total"><span>Total cartons / boxes</span><strong>{cartCount}</strong><span className="cart-piece-total">Total individual pieces</span><strong>{cart.reduce((n, line) => n + line.qty * line.product.piecesPerCarton, 0)}</strong></div><button className="btn btn-primary checkout-btn" onClick={placeOrder}>Place order <ChevronRight size={17}/></button><p className="demo-warning">Demo only: this creates a sample order in this browser session. No real order is sent.</p></div></>}</section></div>}
    {notice && <div className="toast"><CheckCircle2 size={18}/>{notice}<button onClick={()=>setNotice("")} aria-label="Dismiss notification"><X size={15}/></button></div>}
  </div>;
}

function Metric({label,value,change,icon,tone}:{label:string;value:string;change:string;icon:string;tone:string}) { return <article className="metric-card"><div className="metric-top"><span>{label}</span><div className={`metric-icon ${tone}`}>{icon}</div></div><div className="metric-value">{value}</div><div className="metric-change"><span className={`change-dot ${tone}`}/>{change}</div></article>; }
function QuickAction({icon,title,detail,onClick}:{icon:React.ReactNode;title:string;detail:string;onClick:()=>void}) { return <button className="quick-action" onClick={onClick}><div className="quick-icon">{icon}</div><div><strong>{title}</strong><small>{detail}</small></div><ChevronRight size={17} className="quick-chevron"/></button>; }
function OrderTable({orders,updateOrder,dealerMode=false}:{orders:{id:string;dealer:string;area:string;items:number;pieces:number;products:string[];cancelReason?:string;amount:number;status:string;time:string}[];updateOrder:(id:string,status:string,reason?:string)=>void;dealerMode?:boolean}) { return <div className="table-scroll"><table className="orders-table"><thead><tr><th>ORDER</th><th>{dealerMode?"YOUR SHOP":"DEALER"}</th><th>ORDERED ITEMS / PIECES</th><th>ORDER VALUE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td><strong className="order-id">{o.id}</strong><small className="table-time">{o.time}</small></td><td><div className="table-dealer"><strong>{o.dealer}</strong><small>{o.area}</small></div></td><td><strong>{o.pieces} pieces</strong><small className="table-time">{o.products.join(" · ")}</small></td><td><strong>{money(o.amount)}</strong></td><td><span className={`status status-${o.status.toLowerCase().replaceAll(" ","-")}`}>{o.status}</span>{o.cancelReason && <small className="table-time">Reason: {o.cancelReason}</small>}</td><td>{dealerMode?(o.status==="Pending"?<button className="reject-btn cancel-order-btn" onClick={()=>{const reason=window.prompt("Why are you cancelling this order?");if(reason?.trim())updateOrder(o.id,"Cancelled",reason.trim());else if(reason!==null)window.alert("Enter a cancellation reason to continue.");}}>Cancel</button>:o.status==="Accepted"||o.status==="Processing"?<button className="reject-btn cancel-order-btn" onClick={()=>{const reason=window.prompt("Why are you requesting cancellation?");if(reason?.trim())updateOrder(o.id,"Cancellation requested",reason.trim());else if(reason!==null)window.alert("Enter a cancellation reason to continue.");}}>Request cancel</button>:<span className="table-time">{o.status==="Delivered"?"Completed":o.status==="Cancellation requested"?"Awaiting review":o.status==="Cancelled"?"Cancelled":"Track order"}</span>):o.status==="Pending"?<div className="row-actions"><button className="accept-btn" onClick={()=>updateOrder(o.id,"Accepted")} title="Confirm order"><Check size={15}/></button><button className="reject-btn" onClick={()=>updateOrder(o.id,"Rejected")} title="Reject order"><X size={15}/></button></div>:o.status==="Cancellation requested"?<div className="row-actions"><button className="accept-btn" onClick={()=>updateOrder(o.id,"Cancelled")} title="Approve cancellation"><Check size={15}/></button><button className="reject-btn" onClick={()=>updateOrder(o.id,"Processing")} title="Decline cancellation"><X size={15}/></button></div>:o.status==="Accepted"||o.status==="Processing"?<button className="deliver-btn" onClick={()=>updateOrder(o.id,o.status==="Accepted"?"Processing":"Out for Delivery")}>{o.status==="Accepted"?"Prepare":"Dispatch"}</button>:o.status==="Out for Delivery"?<button className="deliver-btn" onClick={()=>updateOrder(o.id,"Delivered")}>Mark delivered</button>:<span className="table-time">—</span>}</td></tr>)}</tbody></table>{orders.length===0&&<div className="empty-table"><ClipboardList size={25}/><p>No orders in this section yet.</p></div>}</div>; }
