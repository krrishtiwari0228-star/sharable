"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { MapPin, Search, Save, ShieldCheck, FileText, UserRound, Building2, LifeBuoy, LockKeyhole } from "lucide-react";

type Role = "distributor" | "dealer";
type LocationResult = { display_name: string; lat: string; lon: string; address?: Record<string, string> };
type FormState = {
  fullName: string; phone: string; email: string; businessName: string; gstNumber: string;
  contactName: string; contactPhone: string; contactEmail: string; address: string;
  area: string; city: string; state: string; pinCode: string; latitude: string; longitude: string;
};

const emptyForm: FormState = {
  fullName: "", phone: "", email: "", businessName: "", gstNumber: "", contactName: "",
  contactPhone: "", contactEmail: "", address: "", area: "", city: "", state: "", pinCode: "",
  latitude: "", longitude: ""
};

const sections = [
  { id: "profile", label: "My Profile", icon: UserRound },
  { id: "business", label: "Business Information", icon: Building2 },
  { id: "location", label: "Location & Address", icon: MapPin },
  { id: "security", label: "Account Security", icon: LockKeyhole },
  { id: "legal", label: "Legal & Policies", icon: FileText },
  { id: "support", label: "Help & Support", icon: LifeBuoy }
] as const;

export default function SettingsPanel({ role }: { role: Role }) {
  const [section, setSection] = useState<(typeof sections)[number]["id"]>("profile");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [locations, setLocations] = useState<LocationResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) { setError("Supabase is not configured."); setLoading(false); return; }
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { setError("Your session has expired. Sign in again."); setLoading(false); return; }
      const { data: identity, error: identityError } = await supabase.from("profiles").select("full_name,phone,email").eq("id", user.id).single();
      if (identityError) { setError(identityError.message); setLoading(false); return; }
      let business: Record<string, unknown> | null = null;
      if (role === "distributor") {
        const result = await supabase.from("distributors")
          .select("business_name,contact_phone,contact_email,gst_number,billing_address,address_line,area,city,state,pin_code,latitude,longitude")
          .eq("owner_id", user.id).maybeSingle();
        if (result.error) { setError(result.error.message); setLoading(false); return; }
        business = result.data;
      } else {
        const result = await supabase.from("dealer_profiles")
          .select("store_name,contact_name,address,city,pin_code,gst_number,area,state,latitude,longitude")
          .eq("user_id", user.id).maybeSingle();
        if (result.error) { setError(result.error.message); setLoading(false); return; }
        business = result.data;
      }
      if (!active) return;
      const b = business || {};
      setForm({
        ...emptyForm,
        fullName: identity.full_name || "", phone: identity.phone || "", email: user.email || identity.email || "",
        businessName: String(b.business_name || b.store_name || ""),
        gstNumber: String(b.gst_number || ""), contactName: String(b.contact_name || identity.full_name || ""),
        contactPhone: String(b.contact_phone || identity.phone || ""), contactEmail: String(b.contact_email || user.email || ""),
        address: String(b.address_line || b.address || b.billing_address || ""),
        area: String(b.area || ""), city: String(b.city || ""), state: String(b.state || ""), pinCode: String(b.pin_code || ""),
        latitude: b.latitude == null ? "" : String(b.latitude), longitude: b.longitude == null ? "" : String(b.longitude)
      });
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [role]);

  const update = (key: keyof FormState, value: string) => setForm(current => ({ ...current, [key]: value }));
  const flash = (text: string) => { setMessage(text); setError(""); };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError(""); setMessage("");
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase is not configured.");
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Your session has expired. Sign in again.");
      const profilePhone = section === "business" && role === "dealer" ? form.contactPhone : form.phone;
      const profileEmail = section === "business" && role === "dealer" ? form.contactEmail : form.email;
      const { error: identityError } = await supabase.from("profiles").update({
        full_name: form.fullName.trim(), phone: profilePhone.trim(), email: profileEmail.trim()
      }).eq("id", user.id);
      if (identityError) throw identityError;
      if (profileEmail.trim() && profileEmail.trim() !== user.email) {
        const { error: emailError } = await supabase.auth.updateUser({ email: profileEmail.trim() });
        if (emailError) throw new Error("Profile saved, but email verification could not be started: " + emailError.message);
      }
      if (role === "distributor") {
        const { error: businessError } = await supabase.from("distributors").update({
          business_name: form.businessName.trim(), contact_phone: form.contactPhone.trim(),
          contact_email: form.contactEmail.trim(), gst_number: form.gstNumber.trim() || null,
          address_line: form.address.trim(), billing_address: [form.address, form.area, form.city, form.state, form.pinCode].filter(Boolean).join(", "),
          area: form.area.trim(), city: form.city.trim(), state: form.state.trim(), pin_code: form.pinCode.trim(),
          latitude: form.latitude ? Number(form.latitude) : null, longitude: form.longitude ? Number(form.longitude) : null
        }).eq("owner_id", user.id);
        if (businessError) throw businessError;
      } else {
        const { error: businessError } = await supabase.from("dealer_profiles").update({
          store_name: form.businessName.trim(), contact_name: form.contactName.trim(),
          address: [form.address, form.area].filter(Boolean).join(", "), city: form.city.trim(),
          pin_code: form.pinCode.trim(), gst_number: form.gstNumber.trim() || null, area: form.area.trim(),
          state: form.state.trim(), latitude: form.latitude ? Number(form.latitude) : null,
          longitude: form.longitude ? Number(form.longitude) : null
        }).eq("user_id", user.id);
        if (businessError) throw businessError;
      }
      flash("Your profile and business details have been saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save your profile."); }
    finally { setSaving(false); }
  };

  const searchLocation = async () => {
    if (query.trim().length < 3) { setError("Enter at least 3 characters to search for a location."); return; }
    setSearching(true); setError(""); setLocations([]);
    try {
      const response = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=" + encodeURIComponent(query.trim()), { headers: { "Accept-Language": "en" } });
      if (!response.ok) throw new Error("The map search is temporarily unavailable. Enter the address manually.");
      const results = await response.json() as LocationResult[];
      setLocations(results);
      if (!results.length) setError("No matching locations found. Try a nearby landmark or PIN code.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not search this location."); }
    finally { setSearching(false); }
  };

  const chooseLocation = (item: LocationResult) => {
    const a = item.address || {};
    setForm(current => ({
      ...current,
      address: [a.house_number, a.road || a.pedestrian || a.footway].filter(Boolean).join(" "),
      area: a.suburb || a.neighbourhood || a.village || a.hamlet || a.residential || "",
      city: a.city || a.town || a.village || a.county || "",
      state: a.state || "",
      pinCode: a.postcode || "",
      latitude: item.lat, longitude: item.lon
    }));
    setLocations([]); setQuery(item.display_name); flash("Location selected. Review the address fields and save your changes.");
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setMessage("");
    if (password.length < 8) { setError("Use at least 8 characters for your new password."); return; }
    if (password !== confirmPassword) { setError("The passwords do not match."); return; }
    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase is not configured.");
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword(""); setConfirmPassword(""); flash("Password updated successfully.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update password."); }
    finally { setSaving(false); }
  };

  if (loading) return <section className="panel account-panel"><p className="helper-note">Loading your account…</p></section>;

  return <section className="panel settings-panel">
    <div className="settings-intro"><div><h2>Account settings</h2><p>Manage your personal details, business information and account access.</p></div><span className="settings-role">{role === "distributor" ? "DISTRIBUTOR ADMIN" : "DEALER ACCOUNT"}</span></div>
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="Settings sections">
        {sections.map(item => { const Icon = item.icon; return <button type="button" key={item.id} className={section === item.id ? "active" : ""} onClick={() => { setSection(item.id); setError(""); setMessage(""); }}><Icon size={16}/>{item.label}</button>; })}
      </nav>
      <div className="settings-content">
        {error && <p className="settings-alert error" role="alert">{error}</p>}
        {message && <p className="settings-alert success" role="status">{message}</p>}
        {(section === "profile" || section === "business" || section === "location") && <form onSubmit={saveProfile}>
          {section === "profile" && <><h3>My Profile</h3><p className="settings-muted">Your personal contact details used by SupplyDesk.</p><div className="settings-fields"><label>Full name<input required maxLength={100} value={form.fullName} onChange={e=>update("fullName",e.target.value)}/></label><label>Phone number<input type="tel" maxLength={20} value={form.phone} onChange={e=>update("phone",e.target.value)}/></label><label>Email address<input type="email" required value={form.email} onChange={e=>update("email",e.target.value)}/></label></div></>}
          {section === "business" && <><h3>Business Information</h3><p className="settings-muted">Details shown on your business account and order records.</p><div className="settings-fields"><label>{role === "distributor" ? "Business name" : "Shop / store name"}<input required maxLength={140} value={form.businessName} onChange={e=>update("businessName",e.target.value)}/></label>{role === "dealer" && <label>Contact person<input value={form.contactName} onChange={e=>update("contactName",e.target.value)}/></label>}<label>Business phone<input type="tel" value={form.contactPhone} onChange={e=>update("contactPhone",e.target.value)}/></label><label>Business email<input type="email" value={form.contactEmail} onChange={e=>update("contactEmail",e.target.value)}/></label><label>GSTIN<input maxLength={15} value={form.gstNumber} onChange={e=>update("gstNumber",e.target.value.toUpperCase())}/></label></div></>}
          {section === "location" && <><h3>Location & Address</h3><p className="settings-muted">Search for your shop or warehouse, select it on the map, then review the automatically filled address.</p><div className="settings-location-search"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search shop, street, area or PIN code" aria-label="Search map location"/><button className="btn btn-outline" type="button" onClick={() => void searchLocation()} disabled={searching}><Search size={15}/>{searching ? "Searching…" : "Find location"}</button></div>{locations.length > 0 && <div className="settings-location-results">{locations.map((item,index)=><button type="button" key={item.lat+item.lon+index} onClick={()=>chooseLocation(item)}><MapPin size={15}/><span>{item.display_name}</span></button>)}</div>}{form.latitude && form.longitude && <div className="settings-map"><iframe title="Selected business location" loading="lazy" src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(form.longitude)-0.006}%2C${Number(form.latitude)-0.004}%2C${Number(form.longitude)+0.006}%2C${Number(form.latitude)+0.004}&layer=mapnik&marker=${form.latitude}%2C${form.longitude}`}/></div>}<div className="settings-fields"><label>Shop / building / street<input value={form.address} onChange={e=>update("address",e.target.value)}/></label><label>Area / locality<input value={form.area} onChange={e=>update("area",e.target.value)}/></label><label>City<input value={form.city} onChange={e=>update("city",e.target.value)}/></label><label>State<input value={form.state} onChange={e=>update("state",e.target.value)}/></label><label>PIN code<input inputMode="numeric" maxLength={10} value={form.pinCode} onChange={e=>update("pinCode",e.target.value)}/></label></div>{form.latitude && <p className="settings-muted">Map coordinates: {form.latitude}, {form.longitude}</p>}</>}
          <div className="settings-actions"><button className="btn btn-primary" type="submit" disabled={saving}><Save size={15}/>{saving ? "Saving…" : "Save changes"}</button></div>
        </form>}
        {section === "security" && <><h3>Account Security</h3><p className="settings-muted">Change the password used to sign in to SupplyDesk.</p><form onSubmit={savePassword} className="settings-fields"><label>New password<input type="password" minLength={8} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><label>Confirm new password<input type="password" minLength={8} autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required/></label><div className="settings-actions"><button className="btn btn-primary" disabled={saving} type="submit"><ShieldCheck size={15}/>{saving ? "Updating…" : "Update password"}</button></div></form></>}
        {section === "legal" && <><h3>Legal & Policies</h3><p className="settings-muted">Review the policies that govern your use of SupplyDesk.</p><div className="settings-policy"><h4>Terms & Conditions</h4><p>Use SupplyDesk only for lawful wholesale business activity. Orders are subject to product availability, distributor confirmation and the prices shown at checkout. Keep your account credentials secure and ensure your business and delivery details are accurate.</p></div><div className="settings-policy"><h4>Privacy Policy</h4><p>SupplyDesk uses account, business, delivery and order information to operate the wholesale ordering service, maintain records and provide support. Access is restricted according to account permissions. Contact support to request information about your account data.</p></div><div className="settings-policy"><h4>Order & Refund Policy</h4><p>Order changes and cancellations depend on the order status and distributor approval. Report damaged, missing or incorrect items to support promptly with the order number and relevant details. Any refund or replacement is reviewed against the order record.</p></div><p className="settings-muted">These are starter policy summaries. Have the business owner review and publish the final legal terms before production use.</p></>}
        {section === "support" && <><h3>Help & Support</h3><p className="settings-muted">Need help with an order, account or business details?</p><div className="settings-policy"><h4>Contact SupplyDesk support</h4><p>Include your registered email, business name and order number (if relevant) so the team can investigate.</p><p className="settings-muted">Support email and phone details have not been configured by the business administrator yet.</p></div></>}
      </div>
    </div>
  </section>;
}
