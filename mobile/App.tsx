import "react-native-url-polyfill/auto";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, SupabaseClient, Session } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase: SupabaseClient | null = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
}) : null;

type Product = { id: string; name: string; sku: string; brand: string | null; unit_label: string; pieces_per_unit: number; price: number; stock_on_hand: number; discount_percent: number };

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  useEffect(() => {
    if (!supabase) { setMessage("Set Supabase URL and anon key in mobile/.env"); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || !supabase) return;
    let active = true;
    setLoadingProducts(true);
    supabase.from("products").select("id,name,sku,brand,unit_label,pieces_per_unit,price,stock_on_hand,discount_percent")
      .eq("is_active", true).order("name").limit(150)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setMessage(error.message);
        else setProducts((data ?? []) as Product[]);
        setLoadingProducts(false);
      });
    return () => { active = false; };
  }, [session]);

  async function signIn() {
    if (!supabase) { setMessage("Add Supabase environment values first."); return; }
    if (!email.trim() || !password) { setMessage("Enter your email and password."); return; }
    setBusy(true); setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setMessage(error.message);
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setProducts([]);
  }

  if (!session) return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#102a43" />
      <KeyboardAvoidingView style={styles.loginWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.brandMark}><Text style={styles.brandLetter}>S</Text></View>
        <Text style={styles.brand}>SupplyDesk</Text>
        <Text style={styles.tagline}>Wholesale ordering, made simple.</Text>
        <View style={styles.form}>
          <Text style={styles.label}>EMAIL ADDRESS</Text>
          <TextInput value={email} onChangeText={setEmail} placeholder="you@business.com" placeholderTextColor="#8a9aab" keyboardType="email-address" autoCapitalize="none" style={styles.input} />
          <Text style={styles.label}>PASSWORD</Text>
          <TextInput value={password} onChangeText={setPassword} placeholder="Enter your password" placeholderTextColor="#8a9aab" secureTextEntry style={styles.input} />
          {!!message && <Text style={styles.error}>{message}</Text>}
          <TouchableOpacity style={[styles.primary, busy && styles.disabled]} onPress={signIn} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Sign in</Text>}
          </TouchableOpacity>
          <Text style={styles.foot}>Use your existing SupplyDesk dealer or distributor account.</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.safeLight}>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f7fb" />
      <View style={styles.header}>
        <View><Text style={styles.smallCaps}>WHOLESALE PORTAL</Text><Text style={styles.headerTitle}>SupplyDesk</Text></View>
        <TouchableOpacity onPress={signOut} style={styles.logout}><Text style={styles.logoutText}>Sign out</Text></TouchableOpacity>
      </View>
      <View style={styles.welcome}><Text style={styles.welcomeTitle}>Your catalogue</Text><Text style={styles.welcomeSub}>Browse products from your distributor.</Text></View>
      {!!message && <Text style={styles.error}>{message}</Text>}
      {loadingProducts ? <ActivityIndicator style={{ marginTop: 40 }} color="#1d6a56" size="large" /> : (
        <FlatList data={products} keyExtractor={(item) => item.id} contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No active products available yet.</Text>}
          renderItem={({ item }) => <View style={styles.productCard}>
            <View style={styles.productIcon}><Text style={styles.productIconText}>{item.name.slice(0,1).toUpperCase()}</Text></View>
            <View style={styles.productInfo}><Text style={styles.productName}>{item.name}</Text><Text style={styles.productMeta}>{item.brand || item.sku} · {item.pieces_per_unit} pcs/{item.unit_label}</Text><Text style={styles.stock}>Stock: {item.stock_on_hand}</Text></View>
            <View style={styles.priceWrap}><Text style={styles.price}>₹{Number(item.price).toLocaleString("en-IN")}</Text><Text style={styles.priceUnit}>per {item.unit_label}</Text></View>
          </View>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#102a43" }, safeLight: { flex: 1, backgroundColor: "#f4f7fb" },
  loginWrap: { flex: 1, justifyContent: "center", paddingHorizontal: 28 },
  brandMark: { width: 60, height: 60, borderRadius: 18, backgroundColor: "#d9f2e8", alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 14 },
  brandLetter: { fontSize: 30, fontWeight: "900", color: "#145a47" }, brand: { fontSize: 32, fontWeight: "800", color: "#fff", textAlign: "center", letterSpacing: -1 },
  tagline: { color: "#b9c9d8", textAlign: "center", marginTop: 8, fontSize: 15 },
  form: { marginTop: 42, backgroundColor: "#fff", borderRadius: 24, padding: 22 },
  label: { color: "#526579", fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 8, marginTop: 8 },
  input: { borderWidth: 1, borderColor: "#e1e8ef", backgroundColor: "#f8fafc", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, color: "#102a43", fontSize: 15, marginBottom: 12 },
  primary: { backgroundColor: "#176b55", borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 8 }, primaryText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  disabled: { opacity: .6 }, error: { color: "#b42318", fontSize: 13, padding: 10 }, foot: { color: "#708194", textAlign: "center", fontSize: 12, marginTop: 16, lineHeight: 18 },
  header: { paddingHorizontal: 20, paddingVertical: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  smallCaps: { color: "#718096", fontSize: 10, letterSpacing: 1.5, fontWeight: "800" }, headerTitle: { fontSize: 24, color: "#102a43", fontWeight: "900", marginTop: 3 },
  logout: { backgroundColor: "#e4eee9", paddingVertical: 9, paddingHorizontal: 13, borderRadius: 10 }, logoutText: { color: "#176b55", fontWeight: "800" },
  welcome: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18 }, welcomeTitle: { color: "#102a43", fontSize: 22, fontWeight: "800" }, welcomeSub: { color: "#718096", fontSize: 13, marginTop: 5 },
  list: { paddingHorizontal: 16, paddingBottom: 28 }, productCard: { backgroundColor: "#fff", borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", marginBottom: 10, borderWidth: 1, borderColor: "#e8edf3" },
  productIcon: { width: 46, height: 46, borderRadius: 12, backgroundColor: "#e5f3ed", alignItems: "center", justifyContent: "center" }, productIconText: { color: "#176b55", fontSize: 20, fontWeight: "900" },
  productInfo: { flex: 1, marginLeft: 12 }, productName: { color: "#102a43", fontSize: 14, fontWeight: "800" }, productMeta: { color: "#718096", fontSize: 11, marginTop: 4 }, stock: { color: "#176b55", fontSize: 11, fontWeight: "700", marginTop: 5 },
  priceWrap: { alignItems: "flex-end", marginLeft: 8 }, price: { color: "#176b55", fontSize: 15, fontWeight: "900" }, priceUnit: { color: "#718096", fontSize: 10, marginTop: 3 },
  empty: { textAlign: "center", color: "#718096", marginTop: 45, fontSize: 14 }
});