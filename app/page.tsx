"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, Search, ShoppingCart, Package, LayoutDashboard, ClipboardList, Boxes, Users, FileSpreadsheet, Settings, Plus, Minus, Check, Truck, ChevronRight, Menu, X, CircleUserRound, ArrowUpRight, CheckCircle2, AlertTriangle, Store as StoreIcon } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Product = { id: number; name: string; category: string; brand: string; sku: string; unit: string; piecesPerCarton: number; minOrder: number; price: number; stock: number; color: string; mark: string };
type CartLine = { product: Product; qty: number };
const initialProducts: Product[] = [
  { id: 1, name: "Royal White Dinner Plate", category: "Crockery", brand: "Casa Royale", sku: "CR-101", unit: "carton", piecesPerCarton: 24, minOrder: 1, price: 960, stock: 42, color: "sage", mark: "◉" },
  { id: 2, name: "Crystal Water Glass", category: "Glassware", brand: "ClearHome", sku: "CH-208", unit: "carton", piecesPerCarton: 36, minOrder: 1, price: 720, stock: 28, color: "blue", mark: "◍" },
  { id: 3, name: "Ceramic Tea Cup Set", category: "Crockery", brand: "Casa Royale", sku: "CR-116", unit: "box", piecesPerCarton: 12, minOrder: 2, price: 540, stock: 65, color: "coral", mark: "☕" },
  { id: 4, name: "Stainless Steel Serving Bowl", category: "Kitchenware", brand: "SteelCraft", sku: "SC-310", unit: "carton", piecesPerCarton: 18, minOrder: 1, price: 1350, stock: 17, color: "sand", mark: "◉" },
  { id: 5, name: "Glass Storage Jar Set", category: "Storage", brand: "ClearHome", sku: "CH-425", unit: "box", piecesPerCarton: 6, minOrder: 1, price: 480, stock: 53, color: "mint", mark: "▤" },
  { id: 6, name: "Melamine Serving Tray", category: "Homeware", brand: "DailyNest", sku: "DN-087", unit: "carton", piecesPerCarton: 24, minOrder: 1, price: 840, stock: 9, color: "plum", mark: "▱" },
  { id: 7, name: "Ceramic Dinner Set", category: "Crockery", brand: "Casa Royale", sku: "CR-520", unit: "carton", piecesPerCarton: 4, minOrder: 1, price: 2400, stock: 14, color: "gold", mark: "✧" },
  { id: 8, name: "Kitchen Canister Set", category: "Kitchenware", brand: "DailyNest", sku: "DN-144", unit: "box", piecesPerCarton: 8, minOrder: 1, price: 640, stock: 31, color: "orange", mark: "▥" }
];
const categories = ["All products", "Crockery", "Glassware", "Kitchenware", "Homeware", "Storage"];
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
  const [signupName, setSignupName] = useState("");
  const [signupBusiness, setSignupBusiness] = useState("");
  const [signupAddress, setSignupAddress] = useState("");
  const [signupCity, setSignupCity] = useState("Pune");
  const [authBusy, setAuthBusy] = useState(false);
  const [page, setPage] = useState("Overview");
  const [products] = useState(initialProducts);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All products");
  const [orders, setOrders] = useState(initialOrders);
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [dealerName, setDealerName] = useState("Shree Ganesh Stores");
  // Admin sign-in is kept off the dealer-facing screen. The distributor can open
  // /?workspace=admin directly; authorization still depends on Supabase credentials and role.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("workspace") === "admin") setLoginRole("distributor");
  }, []);
  // Restore the verified Supabase session; never trust a role stored in browser storage.
  useEffect(() => {
    let active = true;
    const restore = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user && active) {
            const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
            if (profile?.role === "distributor" && active) {
              setRole("distributor"); setPage("Overview"); setSignedIn(true);
            } else if (profile?.role === "dealer" && active) {
              const { data: dealer } = await supabase.from("dealer_profiles").select("store_name,review_status").eq("user_id", session.user.id).single();
              if (dealer?.review_status === "approved") {
                setRole("dealer"); setDealerName(dealer.store_name); setLoginShop(dealer.store_name); setPage("My Orders"); setSignedIn(true);
              } else {
                await supabase.auth.signOut();
              }
            } else if (active) {
              await supabase.auth.signOut();
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
  const filtered = useMemo(() => products.filter(p => (category === "All products" || p.category === category) && `${p.name} ${p.sku} ${p.category} ${p.brand}`.toLowerCase().includes(search.toLowerCase())), [products, category, search]);
  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 3000); };
  const add = (product: Product, delta: number) => setCart(old => { const line = old.find(x => x.product.id === product.id); if (!line && delta > 0) return [...old, { product, qty: Math.min(Math.max(delta, product.minOrder), product.stock) }]; return old.map(x => x.product.id === product.id ? { ...x, qty: Math.max(product.minOrder, Math.min(product.stock, x.qty + delta)) } : x); });
  const updateOrder = (id: string, status: string, reason = "") => { setOrders(old => old.map(o => o.id === id ? { ...o, status, cancelReason: reason || o.cancelReason } : o)); flash(`${id}: ${status === "Cancellation requested" ? "cancellation request sent to distributor" : status === "Cancelled" ? "order cancelled" : `status updated to ${status.toLowerCase()}`}.`); };
  const placeOrder = () => { if (!cart.length) return; const id = `ORD-${1049 + orders.length - 4}`; const order = { id, dealer: dealerName, area: "Pune, Maharashtra", items: cart.length, pieces: cart.reduce((n, line) => n + line.qty * line.product.piecesPerCarton, 0), products: cart.map(line => `${line.product.name} × ${line.qty} ${line.product.unit}${line.qty > 1 ? "s" : ""}`), cancelReason: "", amount: cartTotal, status: "Pending", time: "Just now" }; setOrders(old => [order, ...old]); setCart([]); setShowCart(false); setRole("dealer"); setPage("My Orders"); flash(`Order ${id} placed. Waiting for distributor confirmation (demo).`); };
  const navItems = role === "distributor" ? [{ name: "Overview", icon: LayoutDashboard }, { name: "Orders", icon: ClipboardList }, { name: "Products & Stock", icon: Boxes }, { name: "Dealers", icon: Users }, { name: "Sales & Excel", icon: FileSpreadsheet }] : [{ name: "Product Catalogue", icon: Package }, { name: "My Orders", icon: ClipboardList }, { name: "My Account", icon: CircleUserRound }];
  const selectPage = (name: string) => { setPage(name); setMobileNav(false); if (name === "My Cart") setShowCart(true); };
  const csvExport = () => { const rows = [["Order ID", "Dealer", "Area", "Products", "Total Pieces", "Order Value (INR)", "Status", "Order Time"], ...orders.filter(o => o.status === "Delivered").map(o => [o.id, o.dealer, o.area, o.products.join("; "), o.pieces, o.amount, o.status, o.time])]; const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\r\n"); const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "wholesale-sales-report.csv"; a.click(); URL.revokeObjectURL(url); flash("Sales report exported. Open the CSV file in Excel."); };
  const title = page === "Overview" ? "Good morning, Distributor" : page;
  const isCatalogue = page === "Product Catalogue" || page === "Products & Stock" || page === "Overview";
  if (!signedIn) return <main className="login-screen">
    <section className="login-card">
      <div className="login-brand"><div className="brand-mark">s<span>.</span></div><div><strong>supplydesk</strong><small>WHOLESALE HOMEWARE</small></div></div>
      <div className="login-kicker">BUSINESS PORTAL</div>
      <h1>{authMode === "login" ? "Sign in to your workspace" : "Create your account"}</h1>
      <p className="login-intro">{loginRole === "distributor" ? "Private distributor-owner access." : "Sign in to place and track your wholesale orders."}</p>
      <div className="login-role-tabs">
        <button type="button" className={loginRole === "dealer" ? "chosen" : ""} onClick={() => { setLoginRole("dealer"); setLoginError(""); }}>Dealer <small>Shop account</small></button>
        <button type="button" className={loginRole === "distributor" ? "chosen" : ""} onClick={() => { setLoginRole("distributor"); setLoginError(""); }}>Distributor <small>Owner account</small></button>
      </div>
      <div className="login-role-tabs">
        <button type="button" className={authMode === "login" ? "chosen" : ""} onClick={() => { setAuthMode("login"); setLoginError(""); }}>Login</button>
        <button type="button" className={authMode === "signup" ? "chosen" : ""} onClick={() => { setAuthMode("signup"); setLoginError(""); }}>Create account</button>
      </div>
      <form className="login-form" onSubmit={async event=>{
        event.preventDefault();
        setLoginError("");
        const supabase = getSupabaseBrowserClient();
        if (!supabase) { setLoginError("Supabase authentication is not configured in Vercel."); return; }
        if (authMode === "signup") {
          if (loginRole === "distributor") { setLoginError("For security, the single distributor-owner account must be provisioned through a protected setup. Public distributor registration is disabled."); return; }
          if (!signupName.trim() || !signupBusiness.trim() || !signupAddress.trim() || !signupCity.trim() || !loginEmail.trim() || loginPassword.length < 8) { setLoginError("Complete all fields and use a password of at least 8 characters."); return; }
          setAuthBusy(true);
          try {
            const { data, error } = await supabase.auth.signUp({ email: loginEmail.trim(), password: loginPassword, options: { data: { full_name: signupName.trim(), role: "dealer", store_name: signupBusiness.trim(), contact_name: signupName.trim(), address: signupAddress.trim(), city: signupCity.trim() } } });
            if (error) throw error;
            setLoginShop(signupBusiness.trim());
            setLoginError(data.user ? "Account created, pending distributor approval. You cannot access the dealer portal until the distributor approves your account." : "Check your email to finish registration.");
            setAuthMode("login");
          } catch (error) { setLoginError(error instanceof Error ? error.message : "Could not create account."); }
          finally { setAuthBusy(false); }
          return;
        }
        if(!loginEmail.trim()||!loginPassword.trim()||(loginRole==="dealer"&&!loginShop.trim())){setLoginError("Complete all required fields.");return;}
        setAuthBusy(true);
        try {
        const {data:authData,error:authError}=await supabase.auth.signInWithPassword({email:loginEmail.trim(),password:loginPassword});
        if(authError||!authData.user) throw authError || new Error("Sign-in failed.");
        const {data:profile,error:profileError}=await supabase.from("profiles").select("role,full_name").eq("id",authData.user.id).single();
        if(profileError||!profile){await supabase.auth.signOut();throw new Error("Your account profile is not configured. Contact the distributor administrator.");}
        const actualRole=profile.role==="distributor"?"distributor":profile.role==="dealer"?"dealer":null;
        if(!actualRole||actualRole!==loginRole){await supabase.auth.signOut();throw new Error("This account does not have the selected portal role.");}
        if(actualRole==="dealer"){
          const {data:dealerProfile,error:dealerError}=await supabase.from("dealer_profiles").select("store_name,review_status").eq("user_id",authData.user.id).single();
          if(dealerError||!dealerProfile||dealerProfile.review_status!=="approved"){await supabase.auth.signOut();throw new Error("Dealer account is not approved yet. Contact the distributor.");}
          setDealerName(dealerProfile.store_name); setLoginShop(dealerProfile.store_name); setPage("Product Catalogue");
        }else setPage("Overview");
        setRole(actualRole); setSignedIn(true); window.localStorage.removeItem("supplydesk-demo-session"); flash("Signed in successfully.");
        } catch (error) { setLoginError(error instanceof Error ? error.message : "Sign-in failed."); } finally { setAuthBusy(false); }
      }}>
        {authMode === "signup" && loginRole === "dealer" && <>
          <label>Full name<input value={signupName} onChange={e=>setSignupName(e.target.value)} placeholder="Your full name" required/></label>
          <label>Shop / business name<input value={signupBusiness} onChange={e=>setSignupBusiness(e.target.value)} placeholder="Your shop name" required/></label>
          <label>Business address<input value={signupAddress} onChange={e=>setSignupAddress(e.target.value)} placeholder="Street and area" required/></label>
          <label>City<input value={signupCity} onChange={e=>setSignupCity(e.target.value)} required/></label>
        </>}
        {authMode === "login" && loginRole==="dealer"&&<label>Shop / business name<input value={loginShop} onChange={e=>setLoginShop(e.target.value)} placeholder="Business name registered with distributor" required/></label>}
        <label>Email<input type="email" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} placeholder={loginRole==="dealer"?"dealer@example.com":"distributor-admin@example.com"} autoComplete="username" required/></label>
        <label>Password<input type="password" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} placeholder={authMode === "signup" ? "At least 8 characters" : "Enter your password"} autoComplete={authMode === "signup" ? "new-password" : "current-password"} minLength={authMode === "signup" ? 8 : undefined} required/></label>
        {loginError&&<p className="login-error" role="alert">{loginError}</p>}
        <button className="login-submit" type="submit" disabled={authBusy}>{authBusy ? "Please wait…" : authMode === "signup" ? "Create Dealer account" : "Sign in as " + (loginRole==="dealer"?"Dealer":"Distributor Admin")} <ChevronRight size={17}/></button>
      </form>
      <p className="login-note">Single-distributor setup · Dealer accounts are separate from the distributor account.</p>
      <p className="login-demo-note">Secure sign-in uses the configured business authentication service. Dealer access requires distributor approval.</p>
    </section>
  </main>;
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brand-mark">s<span>.</span></div><div><strong>supplydesk</strong><small>WHOLESALE HOMEWARE</small></div><button className="icon-btn close-nav" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18}/></button></div>
      <div className="workspace-label">WORKSPACE</div>
      <div className="signed-in-badge"><span className="signed-in-dot"/><div><strong>{role === "distributor" ? "Distributor Admin" : "Dealer Portal"}</strong><small>{role === "distributor" ? "Business management" : dealerName}</small></div><button onClick={async () => { const supabase=getSupabaseBrowserClient(); if(supabase) await supabase.auth.signOut(); setSignedIn(false); setLoginPassword(""); setLoginError(""); }} aria-label="Sign out" title="Sign out"><ArrowUpRight size={15}/></button></div>
      <div className="nav-label">{role === "distributor" ? "MANAGE BUSINESS" : "DEALER PORTAL"}</div>
      <nav>{navItems.map(({ name, icon: Icon }) => <button key={name} onClick={() => selectPage(name)} className={`nav-item ${page === name ? "selected" : ""}`}><Icon size={18}/><span>{name}</span>{name === "Orders" && orders.some(o => o.status === "Pending") && <b className="nav-count">{orders.filter(o => o.status === "Pending").length}</b>}{name === "My Cart" && cartCount > 0 && <b className="nav-count">{cartCount}</b>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-dot"/><strong>Need a hand?</strong><p>Our support team is here to help your business run smoothly.</p><button onClick={() => flash("Support contact: add distributor support details in settings.")}>Contact support <ArrowUpRight size={14}/></button></div><button className="nav-item settings" onClick={() => flash("Settings will be available after account setup.")}><Settings size={18}/>Settings</button><div className="user-mini"><div className="avatar">{role === "distributor" ? "AD" : "SG"}</div><div className="user-info"><strong>{role === "distributor" ? "Admin Distributor" : dealerName}</strong><small>{role === "distributor" ? "Distributor account" : "Approved dealer · Demo"}</small></div><span className="online-dot"/></div></div>
    </aside>
    {mobileNav && <button className="scrim" onClick={() => setMobileNav(false)} aria-label="Close menu"/>}
    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="icon-btn mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={20}/></button><div className="breadcrumb">Workspace <ChevronRight size={14}/> <strong>{page}</strong></div></div><div className="top-actions"><div className="status-pill"><span/> System operational</div><button className="icon-btn notification-btn" onClick={() => { setRole("distributor"); setPage("Orders"); }} aria-label="View notifications"><Bell size={19}/>{orders.some(o => o.status === "Pending") && <i/>}</button><div className="top-avatar">{role === "distributor" ? "AD" : "SG"}</div></div></header>
      <div className="content-wrap">
        <section className="page-heading"><div><div className="eyebrow">{role === "distributor" ? "DISTRIBUTOR WORKSPACE" : "DEALER WORKSPACE"} <span className="live-tag"><span/> LIVE DEMO</span></div><h1>{role === "distributor" && page === "Overview" ? <>Good morning, <em>Distributor.</em></> : title}</h1><p>{role === "distributor" ? (page === "Overview" ? "Here's what's happening with your distribution business today." : page === "Orders" ? "Review incoming orders and keep every delivery moving." : page === "Products & Stock" ? "Manage wholesale products, brands, carton quantities, prices and stock." : page === "Sales & Excel" ? "Review delivered sales and export reports for your records." : "Manage dealer access and account details.") : (page === "Product Catalogue" ? "Order crockery, glassware, kitchenware and homeware by carton or box." : page === "My Orders" ? "Track your orders from confirmation through delivery." : "Manage your shop details and orders.")}</p></div><div className="heading-actions">{role === "dealer" && <button className="btn btn-primary" onClick={() => setShowCart(true)}><ShoppingCart size={16}/> Cart <span className="button-count">{cartCount}</span></button>}{role === "distributor" && page === "Products & Stock" && <button className="btn btn-primary" onClick={() => flash("Connect the database to add and save real products.")}><Plus size={17}/> Add product</button>}{role === "distributor" && page === "Sales & Excel" && <button className="btn btn-primary" onClick={csvExport}><FileSpreadsheet size={16}/> Export Excel CSV</button>}</div></section>
        {role === "distributor" && page === "Overview" && <>
          <section className="metric-grid"><Metric label="Total sales" value={money(orders.filter(o => o.status === "Delivered").reduce((n,o) => n + o.amount, 0))} change="Delivered orders" icon="₹" tone="green"/><Metric label="Orders to review" value={String(orders.filter(o => o.status === "Pending").length).padStart(2,"0")} change="Needs your attention" icon="↗" tone="orange"/><Metric label="Active products" value={String(products.length).padStart(2,"0")} change="Crockery, glassware & more" icon="▦" tone="purple"/><Metric label="Low stock items" value={String(products.filter(p => p.stock < 20).length).padStart(2,"0")} change="Restock recommended" icon="!" tone="red"/></section>
          <section className="feature-banner"><div className="banner-symbol"><Package size={23}/></div><div className="banner-copy"><span>YOUR BUSINESS, IN SYNC</span><h2>Every order. One clear picture.</h2><p>Orders, inventory and sales reports come together in one workspace.</p></div><div className="banner-art"><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="art-box"><Package size={32}/></div><div className="art-chip chip-one"><Check size={13}/> Stock synced</div><div className="art-chip chip-two"><Truck size={14}/> On its way</div></div></section>
          <section className="dashboard-grid"><div className="panel orders-panel"><div className="panel-head"><div><h2>Recent orders</h2><p>Latest activity from your dealers</p></div><button className="text-link" onClick={() => setPage("Orders")}>View all <ChevronRight size={15}/></button></div><OrderTable orders={orders.slice(0,4)} updateOrder={updateOrder}/></div><div className="panel inventory-panel"><div className="panel-head"><div><h2>Stock overview</h2><p>Inventory that needs a look</p></div><button className="icon-btn subtle" onClick={() => setPage("Products & Stock")} aria-label="View stock"><ArrowUpRight size={17}/></button></div><div className="stock-summary"><div><span className="stock-number">{products.reduce((n,p)=>n+p.stock,0).toLocaleString("en-IN")}</span><small>Cartons / boxes in stock</small></div><div className="stock-progress"><span style={{width:"74%"}}/></div><div className="stock-foot"><span><i className="legend-dot green-dot"/> In stock</span><strong>{products.filter(p=>p.stock>=20).length} products</strong></div><div className="stock-foot"><span><i className="legend-dot orange-dot"/> Low stock</span><strong>{products.filter(p=>p.stock<20).length} products</strong></div></div><div className="low-stock-list">{products.filter(p=>p.stock<50).slice(0,3).map(p=><div className="low-stock-row" key={p.id}><div className={`tiny-product ${p.color}`}>{p.mark}</div><div className="low-product-name"><strong>{p.name}</strong><small>{p.sku}</small></div><span className={p.stock<20?"stock-badge danger":"stock-badge warning"}>{p.stock} left</span></div>)}</div></div></section>
          <section className="panel quick-panel"><div className="panel-head"><div><h2>Quick actions</h2><p>Get to the things you do most</p></div></div><div className="quick-actions"><QuickAction icon={<ClipboardList size={19}/>} title="Review new orders" detail="Accept or reject dealer orders" onClick={()=>setPage("Orders")}/><QuickAction icon={<Boxes size={19}/>} title="Manage inventory" detail="Update products and stock" onClick={()=>setPage("Products & Stock")}/><QuickAction icon={<FileSpreadsheet size={19}/>} title="Export sales report" detail="Download delivered sales" onClick={csvExport}/></div></section>
        </>}
        {role === "distributor" && page === "Orders" && <section className="panel full-panel"><div className="panel-head"><div><h2>All orders</h2><p>Accept, process and complete dealer orders.</p></div><span className="soft-count">{orders.length} orders</span></div><OrderTable orders={orders} updateOrder={updateOrder}/></section>}
        {isCatalogue && (page !== "Overview" || role === "dealer") && <section className="catalogue-section"><div className="catalogue-toolbar"><div className="search-box"><Search size={17}/><input placeholder="Search products or SKU..." value={search} onChange={e=>setSearch(e.target.value)}/>{search && <button onClick={()=>setSearch("")} aria-label="Clear search"><X size={14}/></button>}</div>{role === "dealer" && <button className="btn btn-outline cart-toolbar" onClick={()=>setShowCart(true)}><ShoppingCart size={16}/> Cart ({cartCount})</button>}</div><div className="category-row">{categories.map(c=><button key={c} className={category===c?"category-chip active":"category-chip"} onClick={()=>setCategory(c)}>{c}</button>)}</div><div className="product-grid">{filtered.map(p=><article className="product-card" key={p.id}><div className={`product-visual ${p.color}`}><span className="product-category">{p.category}</span><div className="product-illustration">{p.mark}</div><span className={p.stock<20?"stock-label low":"stock-label"}>{p.stock<1?"Out of stock":p.stock<20?"Low stock":`${p.stock} ${p.unit}s in stock`}</span></div><div className="product-info"><div className="sku">{p.brand} · SKU {p.sku}</div><h3>{p.name}</h3><p>{p.piecesPerCarton} pieces per {p.unit} · Min. {p.minOrder}</p><div className="product-buy"><div><strong>{money(p.price)}</strong><small>per {p.unit.toLowerCase()}</small></div>{role === "dealer" ? <button className="add-btn" disabled={p.stock<p.minOrder} onClick={()=>{add(p,p.minOrder);flash(`${p.name} added to cart`);}}><Plus size={16}/> Add</button> : <span className="stock-qty">{p.stock} {p.unit}s</span>}</div>{role === "dealer" && cart.some(x=>x.product.id===p.id) && <div className="inline-quantity"><button onClick={()=>add(p,-1)} aria-label="Decrease quantity"><Minus size={13}/></button><span>{cart.find(x=>x.product.id===p.id)?.qty} in cart</span><button onClick={()=>add(p,1)} aria-label="Increase quantity"><Plus size={13}/></button></div>}</div></article>)}</div>{filtered.length===0&&<div className="empty-state"><Package size={30}/><h3>No products found</h3><p>Try another search or category.</p></div>}</section>}
        {role === "distributor" && page === "Sales & Excel" && <section className="panel full-panel"><div className="panel-head"><div><h2>Delivered sales ledger</h2><p>Only delivered orders count as completed sales in this demo.</p></div><button className="btn btn-primary" onClick={csvExport}><FileSpreadsheet size={16}/> Export CSV for Excel</button></div><div className="sales-summary"><div><span>Completed sales value</span><strong>{money(orders.filter(o=>o.status==="Delivered").reduce((n,o)=>n+o.amount,0))}</strong></div><div><span>Delivered orders</span><strong>{orders.filter(o=>o.status==="Delivered").length}</strong></div><div><span>Pieces delivered</span><strong>{orders.filter(o=>o.status==="Delivered").reduce((n,o)=>n+o.pieces,0)}</strong></div></div><OrderTable orders={orders.filter(o=>o.status==="Delivered")} updateOrder={updateOrder}/><p className="helper-note"><AlertTriangle size={15}/> Demo data only. Production sales records must be stored in the database and exported from verified delivered order items.</p></section>}
        {role === "distributor" && page === "Dealers" && <section className="panel full-panel"><div className="panel-head"><div><h2>Dealer accounts</h2><p>Example dealer records for the interface preview.</p></div><button className="btn btn-outline" onClick={()=>flash("Dealer invitations require backend setup.")}><Plus size={16}/> Invite dealer</button></div><div className="dealer-row"><div className="avatar">SG</div><div className="dealer-details"><strong>Shree Ganesh Stores</strong><small>Kothrud, Pune · dealer@example.com</small></div><span className="status status-accepted">Approved</span><button className="icon-btn subtle" onClick={()=>flash("Connect Supabase to manage dealer accounts.")}><ChevronRight size={17}/></button></div><div className="dealer-row"><div className="avatar avatar-blue">SP</div><div className="dealer-details"><strong>Sai Provision Store</strong><small>Bibwewadi, Pune · dealer@example.com</small></div><span className="status status-pending">Pending review</span><button className="btn btn-outline small-btn" onClick={()=>flash("Dealer approval will be saved once backend is connected.")}>Review</button></div></section>}
        {role === "dealer" && page === "My Orders" && <section className="panel full-panel"><div className="panel-head"><div><h2>Your orders</h2><p>Follow each order from placement to delivery.</p></div></div><OrderTable orders={orders.filter(o=>o.dealer===dealerName)} updateOrder={updateOrder} dealerMode/></section>}
        {role === "dealer" && page === "My Account" && <section className="panel account-panel"><div className="panel-head"><div><h2>Shop profile</h2><p>Details used for order and delivery updates.</p></div></div><label className="form-label">Shop / store name<input value={dealerName} onChange={e=>setDealerName(e.target.value)} /></label><label className="form-label">Contact name<input defaultValue="Shop Owner" /></label><label className="form-label">Mobile number<input placeholder="Enter mobile number" /></label><label className="form-label">Delivery address<textarea placeholder="Shop address, area, city and PIN code" rows={3}/></label><button className="btn btn-primary" onClick={()=>flash("Profile changes are local to this demo; connect backend to save.")}>Save profile</button></section>}
        <footer className="footer"><span>© 2026 SupplyDesk <span className="footer-dot">·</span> Built for better distribution.</span><span><i/> All systems in demo</span></footer>
      </div>
    </main>
    {showCart && <div className="modal-backdrop" onClick={()=>setShowCart(false)}><section className="cart-drawer" onClick={e=>e.stopPropagation()}><div className="drawer-head"><div><span className="eyebrow">DEALER ORDER</span><h2>Your cart <span>({cartCount})</span></h2></div><button className="icon-btn" onClick={()=>setShowCart(false)} aria-label="Close cart"><X size={20}/></button></div>{cart.length===0?<div className="empty-cart"><div className="empty-cart-icon"><ShoppingCart size={25}/></div><h3>Your cart is empty</h3><p>Choose products from the catalogue to build your order.</p><button className="btn btn-primary" onClick={()=>{setShowCart(false);setRole("dealer");setPage("Product Catalogue");}}>Browse products</button></div>:<><div className="cart-items">{cart.map(line=><div className="cart-line" key={line.product.id}><div className={`cart-product-icon ${line.product.color}`}>{line.product.mark}</div><div className="cart-line-info"><strong>{line.product.name}</strong><small>{money(line.product.price)} / {line.product.unit}</small><div className="quantity-control"><button onClick={()=>add(line.product,-1)} aria-label="Decrease quantity"><Minus size={13}/></button><span>{line.qty}</span><button onClick={()=>add(line.product,1)} aria-label="Increase quantity"><Plus size={13}/></button></div></div><strong className="line-total">{money(line.qty*line.product.price)}</strong><button className="remove-line" onClick={()=>setCart(old=>old.filter(x=>x.product.id!==line.product.id))} aria-label="Remove product"><X size={15}/></button></div>)}</div><div className="checkout-area"><div className="checkout-note"><CheckCircle2 size={16}/> Stock is checked again when your order is submitted.</div><div className="checkout-total"><span>Order total</span><strong>{money(cartTotal)}</strong></div><div className="checkout-total muted-total"><span>Total cartons / boxes</span><strong>{cartCount}</strong><span className="cart-piece-total">Total individual pieces</span><strong>{cart.reduce((n, line) => n + line.qty * line.product.piecesPerCarton, 0)}</strong></div><button className="btn btn-primary checkout-btn" onClick={placeOrder}>Place order <ChevronRight size={17}/></button><p className="demo-warning">Demo only: this creates a sample order in this browser session. No real order is sent.</p></div></>}</section></div>}
    {notice && <div className="toast"><CheckCircle2 size={18}/>{notice}<button onClick={()=>setNotice("")} aria-label="Dismiss notification"><X size={15}/></button></div>}
  </div>;
}

function Metric({label,value,change,icon,tone}:{label:string;value:string;change:string;icon:string;tone:string}) { return <article className="metric-card"><div className="metric-top"><span>{label}</span><div className={`metric-icon ${tone}`}>{icon}</div></div><div className="metric-value">{value}</div><div className="metric-change"><span className={`change-dot ${tone}`}/>{change}</div></article>; }
function QuickAction({icon,title,detail,onClick}:{icon:React.ReactNode;title:string;detail:string;onClick:()=>void}) { return <button className="quick-action" onClick={onClick}><div className="quick-icon">{icon}</div><div><strong>{title}</strong><small>{detail}</small></div><ChevronRight size={17} className="quick-chevron"/></button>; }
function OrderTable({orders,updateOrder,dealerMode=false}:{orders:{id:string;dealer:string;area:string;items:number;pieces:number;products:string[];cancelReason?:string;amount:number;status:string;time:string}[];updateOrder:(id:string,status:string,reason?:string)=>void;dealerMode?:boolean}) { return <div className="table-scroll"><table className="orders-table"><thead><tr><th>ORDER</th><th>{dealerMode?"YOUR SHOP":"DEALER"}</th><th>ORDERED ITEMS / PIECES</th><th>ORDER VALUE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td><strong className="order-id">{o.id}</strong><small className="table-time">{o.time}</small></td><td><div className="table-dealer"><strong>{o.dealer}</strong><small>{o.area}</small></div></td><td><strong>{o.pieces} pieces</strong><small className="table-time">{o.products.join(" · ")}</small></td><td><strong>{money(o.amount)}</strong></td><td><span className={`status status-${o.status.toLowerCase().replaceAll(" ","-")}`}>{o.status}</span>{o.cancelReason && <small className="table-time">Reason: {o.cancelReason}</small>}</td><td>{dealerMode?(o.status==="Pending"?<button className="reject-btn cancel-order-btn" onClick={()=>{const reason=window.prompt("Why are you cancelling this order?");if(reason?.trim())updateOrder(o.id,"Cancelled",reason.trim());else if(reason!==null)window.alert("Enter a cancellation reason to continue.");}}>Cancel</button>:o.status==="Accepted"||o.status==="Processing"?<button className="reject-btn cancel-order-btn" onClick={()=>{const reason=window.prompt("Why are you requesting cancellation?");if(reason?.trim())updateOrder(o.id,"Cancellation requested",reason.trim());else if(reason!==null)window.alert("Enter a cancellation reason to continue.");}}>Request cancel</button>:<span className="table-time">{o.status==="Delivered"?"Completed":o.status==="Cancellation requested"?"Awaiting review":o.status==="Cancelled"?"Cancelled":"Track order"}</span>):o.status==="Pending"?<div className="row-actions"><button className="accept-btn" onClick={()=>updateOrder(o.id,"Accepted")} title="Confirm order"><Check size={15}/></button><button className="reject-btn" onClick={()=>updateOrder(o.id,"Rejected")} title="Reject order"><X size={15}/></button></div>:o.status==="Cancellation requested"?<div className="row-actions"><button className="accept-btn" onClick={()=>updateOrder(o.id,"Cancelled")} title="Approve cancellation"><Check size={15}/></button><button className="reject-btn" onClick={()=>updateOrder(o.id,"Processing")} title="Decline cancellation"><X size={15}/></button></div>:o.status==="Accepted"||o.status==="Processing"?<button className="deliver-btn" onClick={()=>updateOrder(o.id,o.status==="Accepted"?"Processing":"Out for Delivery")}>{o.status==="Accepted"?"Prepare":"Dispatch"}</button>:o.status==="Out for Delivery"?<button className="deliver-btn" onClick={()=>updateOrder(o.id,"Delivered")}>Mark delivered</button>:<span className="table-time">—</span>}</td></tr>)}</tbody></table>{orders.length===0&&<div className="empty-table"><ClipboardList size={25}/><p>No orders in this section yet.</p></div>}</div>; }
