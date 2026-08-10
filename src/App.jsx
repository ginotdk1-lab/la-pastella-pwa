import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient";
import {
  Wheat, MapPin, Phone, ShoppingBag, Search, Plus, Minus, X, Trash2,
  Clock, CalendarDays, Lock, LayoutDashboard, Package, Timer, CalendarX,
  Settings as SettingsIcon, LogOut, ChevronRight, Check, AlertCircle,
  History, RotateCcw, CalendarPlus, Navigation, BellRing,
  Users, ImagePlus, User
} from "lucide-react";

/* ---------- helpers ---------- */
const uid = () => Math.random().toString(36).slice(2, 10);
const eur = (n) => `€ ${Number(n).toFixed(2)}`;
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const dateLabel = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });

const DEFAULT_SETTINGS = {
  name: "La Pastella",
  phone: "059 315885",
  address: "Viale Antonio Gramsci, 74, 41122 Modena",
  hours: "07:30 – 13:30",
  description: "Pasta fresca all'uovo fatta a mano, ogni giorno, come una volta.",
  managerPasscode: "pastella2026",
  qtyStep: 0.5,
  qtyMin: 0.5,
  qtyMax: 5,
};

const SEED_PRODUCTS = [
  { name: "Tortellini", category: "Pasta ripiena", price: 42, desc: "" },
  { name: "Tortelloni ricotta e spinaci", category: "Pasta ripiena", price: 24, desc: "" },
  { name: "Tortelloni di zucca", category: "Pasta ripiena", price: 24, desc: "" },
  { name: "Tagliatelle", category: "Pasta fresca", price: 18, desc: "" },
  { name: "Pasta da Brodo", category: "Pasta fresca", price: 20, desc: "" },
  { name: "Zuppa Imperiale", category: "Pasta fresca", price: 24, desc: "" },
  { name: "Passatelli", category: "Pasta fresca", price: 24, desc: "" },
  { name: "Maccheroni al pettine", category: "Pasta fresca", price: 24, desc: "" },
  { name: "Lasagne al Ragù bolognese", category: "Lasagne", price: 22, desc: "" },
  { name: "Lasagne alle verdure", category: "Lasagne", price: 22, desc: "" },
  { name: "Lasagne ai funghi", category: "Lasagne", price: 22, desc: "" },
  { name: "Lasagne ai carciofi", category: "Lasagne", price: 22, desc: "" },
  { name: "Rosette", category: "Pasta ripiena", price: 22, desc: "" },
].map((p, i) => ({ id: uid(), unit: "kg", available: true, order: i, image: "", ...p }));

const SEED_SLOTS = [
  "07:30-08:00", "08:00-08:30", "08:30-09:00", "09:00-09:30", "09:30-10:00",
  "10:00-10:30", "10:30-11:00", "11:00-11:30", "11:30-12:00", "12:00-12:30",
  "12:30-13:00", "13:00-13:30",
].map((label, i) => ({ id: uid(), label, capacity: 1, active: true, order: i }));

const ORDER_STATUSES = ["Ricevuto", "Confermato", "In preparazione", "Pronto", "Ritirato", "Annullato"];
const STATUS_COLOR = {
  Ricevuto: { c: "#8A6A1F", bg: "#F3E6C4" },
  Confermato: { c: "#6B4A96", bg: "#E7DCF3" },
  "In preparazione": { c: "#B5533C", bg: "#F5DDD3" },
  Pronto: { c: "#3F6B3A", bg: "#DEEBDA" },
  Ritirato: { c: "#5A5A5A", bg: "#E6E6E1" },
  Annullato: { c: "#8C3B3B", bg: "#F1DCDC" },
};

function storageKey(scope, key) { return `la-pastella:${scope}:${key}`; }

async function loadShared(key, fallback) {
  try {
    const { data, error } = await supabase
      .from("shared_state")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    return data ? data.value : fallback;
  } catch (e) {
    console.error("loadShared", key, e);
    return fallback;
  }
}
async function saveShared(key, value) {
  try {
    const { error } = await supabase
      .from("shared_state")
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) throw error;
  } catch (e) {
    console.error("saveShared", key, e);
  }
  return value;
}
async function loadPersonal(key, fallback) {
  try {
    const value = localStorage.getItem(storageKey("personal", key));
    return value ? JSON.parse(value) : fallback;
  } catch { return fallback; }
}
async function savePersonal(key, value) {
  try { localStorage.setItem(storageKey("personal", key), JSON.stringify(value)); } catch {}
  return value;
}

async function uploadProductImage(file) {
  const ext = file.name.split(".").pop();
  const path = `${uid()}.${ext}`;
  const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
}

function useAlarm() {
  const audioRef = useRef(null);
  const beepRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const stop = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (beepRef.current) { beepRef.current.stop(); beepRef.current = null; }
    setPlaying(false);
  }, []);

  const start = useCallback((customSrc) => {
    if (audioRef.current || beepRef.current) return;
    if (customSrc) {
      const audio = new Audio(customSrc);
      audio.loop = true;
      audio.play().catch(() => {});
      audioRef.current = audio;
    } else {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        const beep = () => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = 880;
          osc.connect(gain);
          gain.connect(ctx.destination);
          gain.gain.setValueAtTime(0.25, ctx.currentTime);
          osc.start();
          osc.stop(ctx.currentTime + 0.35);
        };
        beep();
        const interval = setInterval(beep, 800);
        beepRef.current = { stop: () => { clearInterval(interval); ctx.close(); } };
      } catch {}
    }
    setPlaying(true);
  }, []);

  return { playing, start, stop };
}

/* ---------- root ---------- */
export default function App() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [products, setProducts] = useState([]);
  const [slots, setSlots] = useState([]);
  const [closures, setClosures] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState([]);
  const [clientToken, setClientToken] = useState("");
  const [view, setView] = useState("home");
  const [cartOpen, setCartOpen] = useState(false);
  const [managerAuthed, setManagerAuthed] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);
  const [toast, setToast] = useState("");
  const [profile, setProfile] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [managerSound, setManagerSound] = useState(null);
  const managerAlarm = useAlarm();
  const customerAlarm = useAlarm();
  const seenOrderIds = useRef(null);
  const seenReadyIds = useRef(null);

  useEffect(() => {
    (async () => {
      const [s, p, sl, cl, ord, ct, prof, custs, snd] = await Promise.all([
        loadShared("pastella:settings", null),
        loadShared("pastella:products", null),
        loadShared("pastella:slots", null),
        loadShared("pastella:closures", []),
        loadShared("pastella:orders", []),
        loadPersonal("pastella:clientToken", null),
        loadPersonal("pastella:profile", null),
        loadShared("pastella:customers", []),
        loadPersonal("pastella:managerSound", null),
      ]);
      setSettings(s || (await saveShared("pastella:settings", DEFAULT_SETTINGS)));
      setProducts(p || (await saveShared("pastella:products", SEED_PRODUCTS)));
      setSlots(sl || (await saveShared("pastella:slots", SEED_SLOTS)));
      setClosures(cl);
      setOrders(ord);
      setCustomers(custs);
      setManagerSound(snd);
      const token = ct || uid();
      if (!ct) await savePersonal("pastella:clientToken", token);
      setClientToken(token);
      const c = await loadPersonal(`pastella:cart:${token}`, []);
      setCart(c);
      setProfile(prof);
      seenOrderIds.current = new Set(ord.map((o) => o.id));
      seenReadyIds.current = new Set(ord.filter((o) => o.status === "Pronto").map((o) => o.id));
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(async () => {
      const latest = await loadShared("pastella:orders", []);
      setOrders(latest);

      if (managerAuthed) {
        const fresh = latest.filter((o) => !seenOrderIds.current.has(o.id));
        if (fresh.length > 0) {
          fresh.forEach((o) => seenOrderIds.current.add(o.id));
          managerAlarm.start(managerSound);
        }
      } else {
        latest.forEach((o) => seenOrderIds.current.add(o.id));
      }

      const myReady = latest.filter((o) => o.clientToken === clientToken && o.status === "Pronto");
      const freshReady = myReady.filter((o) => !seenReadyIds.current.has(o.id));
      if (freshReady.length > 0) {
        freshReady.forEach((o) => seenReadyIds.current.add(o.id));
        customerAlarm.start(null);
      }
    }, 7000);
    return () => clearInterval(interval);
  }, [ready, managerAuthed, managerSound, clientToken]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const persistCart = useCallback(
    (next) => {
      setCart(next);
      savePersonal(`pastella:cart:${clientToken}`, next);
    },
    [clientToken]
  );

  const addToCart = (product, qty) => {
    const existing = cart.find((i) => i.productId === product.id);
    let next;
    if (existing) {
      next = cart.map((i) => (i.productId === product.id ? { ...i, qty: +(i.qty + qty).toFixed(2) } : i));
    } else {
      next = [...cart, { productId: product.id, qty }];
    }
    persistCart(next);
    showToast(`${product.name} aggiunto al carrello`);
  };
  const setCartQty = (productId, qty) => {
    if (qty <= 0) return persistCart(cart.filter((i) => i.productId !== productId));
    persistCart(cart.map((i) => (i.productId === productId ? { ...i, qty } : i)));
  };
  const removeFromCart = (productId) => persistCart(cart.filter((i) => i.productId !== productId));
  const clearCart = () => persistCart([]);

  const cartDetailed = useMemo(
    () =>
      cart
        .map((i) => {
          const p = products.find((x) => x.id === i.productId);
          return p ? { ...i, product: p, subtotal: p.price * i.qty } : null;
        })
        .filter(Boolean),
    [cart, products]
  );
  const cartTotal = useMemo(() => cartDetailed.reduce((s, i) => s + i.subtotal, 0), [cartDetailed]);

  const refreshOrders = async () => {
    const latest = await loadShared("pastella:orders", []);
    setOrders(latest);
    return latest;
  };

  const myOrders = useMemo(
    () => orders.filter((o) => o.clientToken === clientToken).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [orders, clientToken]
  );

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#FBF3E3" }}>
        <Wheat className="animate-pulse" size={28} color="#D9A441" />
      </div>
    );
  }

  if (!profile) {
    return (
      <Onboarding
        onSubmit={async (data) => {
          const p = { ...data, clientToken, createdAt: new Date().toISOString() };
          await savePersonal("pastella:profile", p);
          setProfile(p);
          const latestCustomers = await loadShared("pastella:customers", []);
          const nextCustomers = [...latestCustomers.filter((c) => c.clientToken !== clientToken), p];
          await saveShared("pastella:customers", nextCustomers);
          setCustomers(nextCustomers);
        }}
      />
    );
  }

  return (
    <div
      className="min-h-screen w-full pb-20"
      style={{ background: "#FBF3E3", fontFamily: "'Work Sans', ui-sans-serif, system-ui", color: "#4A2E1E" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Work+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap');
        .font-display { font-family: 'Fraunces', serif; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
        input[type=date]::-webkit-calendar-picker-indicator{opacity:0.6}
      `}</style>

      {toast && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-sm font-semibold shadow-lg flex items-center gap-2"
          style={{ background: "#4A2E1E", color: "#FBF3E3" }}
        >
          <Check size={14} /> {toast}
        </div>
      )}

      {(managerAlarm.playing || customerAlarm.playing) && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center">
          {managerAlarm.playing && (
            <div className="px-4 py-2.5 rounded-full text-sm font-semibold shadow-lg flex items-center gap-2" style={{ background: "#B5533C", color: "#fff" }}>
              <BellRing size={15} /> Nuovo ordine!
              <button onClick={managerAlarm.stop} className="ml-1 underline text-xs">Ferma suono</button>
            </div>
          )}
          {customerAlarm.playing && (
            <div className="px-4 py-2.5 rounded-full text-sm font-semibold shadow-lg flex items-center gap-2" style={{ background: "#3F6B3A", color: "#fff" }}>
              <BellRing size={15} /> Il tuo ordine è pronto!
              <button onClick={customerAlarm.stop} className="ml-1 underline text-xs">Ferma suono</button>
            </div>
          )}
        </div>
      )}

      {view !== "manager" && view !== "manager-login" && (
        <TopBar settings={settings} view={view} setView={setView} cartCount={cartDetailed.length} onCart={() => setCartOpen(true)} />
      )}

      <main className="max-w-3xl mx-auto px-4">
        {view === "home" && <Home settings={settings} setView={setView} />}
        {view === "catalog" && (
          <Catalog products={products} settings={settings} onAdd={addToCart} />
        )}
        {view === "history" && (
          <HistoryView
            orders={myOrders}
            products={products}
            slots={slots}
            onReorder={(items) => {
              const next = [...cart];
              let skipped = [];
              items.forEach((it) => {
                const p = products.find((x) => x.id === it.productId);
                if (!p || !p.available) {
                  skipped.push(it.productId);
                  return;
                }
                const ex = next.find((n) => n.productId === it.productId);
                if (ex) ex.qty = +(ex.qty + it.qty).toFixed(2);
                else next.push({ productId: it.productId, qty: it.qty });
              });
              persistCart(next);
              showToast(skipped.length ? "Alcuni prodotti non sono più disponibili" : "Carrello ricreato");
              setView("catalog");
            }}
          />
        )}
        {view === "checkout" && (
          <Checkout
            settings={settings}
            slots={slots}
            closures={closures}
            cartDetailed={cartDetailed}
            cartTotal={cartTotal}
            profile={profile}
            onBack={() => setView("catalog")}
            onSubmit={async (form) => {
              const latest = await refreshOrders();
              const count = latest.filter(
                (o) => o.pickupDate === form.pickupDate && o.slotId === form.slotId && o.status !== "Annullato"
              ).length;
              const slot = slots.find((s) => s.id === form.slotId);
              if (!slot || !slot.active || count >= slot.capacity) {
                showToast("Questa fascia è stata appena occupata. Scegline un'altra.");
                await refreshOrders();
                return false;
              }
              const order = {
                id: uid(),
                orderNumber: latest.length + 1,
                clientToken,
                customerName: form.customerName,
                phone: form.phone,
                email: form.email,
                pickupDate: form.pickupDate,
                slotId: form.slotId,
                items: cart,
                total: cartTotal,
                notes: form.notes,
                status: "Ricevuto",
                createdAt: new Date().toISOString(),
                clientCognome: profile?.cognome || "",
                clientEta: profile?.eta || "",
              };
              const next = [...latest, order];
              await saveShared("pastella:orders", next);
              const verify = await loadShared("pastella:orders", []);
              if (!verify.find((o) => o.id === order.id)) {
                showToast("Errore di connessione: l'ordine non è stato salvato. Riprova.");
                return false;
              }
              setOrders(verify);
              seenOrderIds.current.add(order.id);
              clearCart();
              setLastOrder(order);
              setView("confirmation");
              return true;
            }}
          />
        )}
        {view === "confirmation" && lastOrder && (
          <Confirmation
            order={lastOrder}
            settings={settings}
            slots={slots}
            products={products}
            onDone={() => setView("home")}
          />
        )}
        {view === "manager-login" && (
          <ManagerLogin
            settings={settings}
            onSuccess={() => {
              setManagerAuthed(true);
              setView("manager");
            }}
            onCancel={() => setView("home")}
          />
        )}
        {view === "manager" && managerAuthed && (
          <ManagerPanel
            settings={settings}
            setSettings={async (s) => setSettings(await saveShared("pastella:settings", s))}
            products={products}
            setProducts={async (p) => setProducts(await saveShared("pastella:products", p))}
            slots={slots}
            setSlots={async (s) => setSlots(await saveShared("pastella:slots", s))}
            closures={closures}
            setClosures={async (c) => setClosures(await saveShared("pastella:closures", c))}
            orders={orders}
            setOrders={async (o) => setOrders(await saveShared("pastella:orders", o))}
            customers={customers}
            managerSound={managerSound}
            setManagerSound={async (dataUrl) => { await savePersonal("pastella:managerSound", dataUrl); setManagerSound(dataUrl); }}
            onTestSound={() => managerAlarm.start(managerSound)}
            onStopSound={managerAlarm.stop}
            soundPlaying={managerAlarm.playing}
            onLogout={() => {
              setManagerAuthed(false);
              setView("home");
            }}
          />
        )}
      </main>

      {cartOpen && (
        <CartSheet
          items={cartDetailed}
          total={cartTotal}
          settings={settings}
          onClose={() => setCartOpen(false)}
          onQty={setCartQty}
          onRemove={removeFromCart}
          onClear={clearCart}
          onCheckout={() => {
            setCartOpen(false);
            setView("checkout");
          }}
        />
      )}

      {view !== "manager" && view !== "manager-login" && (
        <BottomNav view={view} setView={setView} />
      )}
    </div>
  );
}

/* ---------- onboarding ---------- */
function Onboarding({ onSubmit }) {
  const [form, setForm] = useState({ nome: "", cognome: "", eta: "", telefono: "" });
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = form.nome.trim() && form.cognome.trim() && form.eta && form.telefono.trim();
  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    await onSubmit(form);
    setSubmitting(false);
  };
  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "#FBF3E3" }}>
      <div className="w-full max-w-sm rounded-3xl p-6" style={{ background: "#FFFCF6", border: "1px solid #E9D8AE" }}>
        <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: "#D9A441" }}>
          <User size={20} color="#4A2E1E" />
        </div>
        <h2 className="font-display text-xl font-bold mb-1 text-center">Benvenuto!</h2>
        <p className="text-xs mb-4 text-center" style={{ color: "#8A7458" }}>Inserisci i tuoi dati per iniziare a ordinare</p>
        <div className="space-y-2.5">
          <input placeholder="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: "#E9D8AE" }} />
          <input placeholder="Cognome" value={form.cognome} onChange={(e) => setForm({ ...form, cognome: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: "#E9D8AE" }} />
          <input placeholder="Età" type="number" min="1" max="120" value={form.eta} onChange={(e) => setForm({ ...form, eta: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: "#E9D8AE" }} />
          <input placeholder="Numero di cellulare" type="tel" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: "#E9D8AE" }} />
        </div>
        <button onClick={submit} disabled={!canSubmit || submitting} className="w-full py-3.5 rounded-2xl font-semibold mt-4 disabled:opacity-40" style={{ background: "#4A2E1E", color: "#FBF3E3" }}>
          {submitting ? "Un attimo..." : "Continua"}
        </button>
      </div>
    </div>
  );
}

/* ---------- top bar ---------- */
function TopBar({ settings, view, setView, cartCount, onCart }) {
  return (
    <header className="sticky top-0 z-30 border-b backdrop-blur" style={{ borderColor: "#E9D8AE", background: "#FBF3E3EE" }}>
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
        <button onClick={() => setView("home")} className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#D9A441" }}>
            <Wheat size={16} color="#4A2E1E" />
          </div>
          <span className="font-display font-semibold text-lg">{settings.name}</span>
        </button>
        <button onClick={onCart} className="relative w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#4A2E1E" }}>
          <ShoppingBag size={16} color="#FBF3E3" />
          {cartCount > 0 && (
            <span
              className="absolute -top-1 -right-1 text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center"
              style={{ background: "#B5533C", color: "#fff" }}
            >
              {cartCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}

function BottomNav({ view, setView }) {
  const items = [
    { key: "home", label: "Home", icon: Wheat },
    { key: "catalog", label: "Prodotti", icon: Package },
    { key: "history", label: "Storico", icon: History },
    { key: "manager-login", label: "Gestore", icon: Lock },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t" style={{ background: "#FFFCF6", borderColor: "#E9D8AE" }}>
      <div className="max-w-3xl mx-auto grid grid-cols-4">
        {items.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium"
            style={{ color: view === key ? "#B5533C" : "#8A7458" }}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}

/* ---------- home ---------- */
function Home({ settings, setView }) {
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(settings.address)}`;
  const telUrl = `tel:${settings.phone.replace(/\s+/g, "")}`;
  return (
    <div className="pt-6 pb-4">
      <div className="rounded-3xl p-6 mb-5 text-center" style={{ background: "#FFFCF6", border: "1px solid #E9D8AE" }}>
        <div className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: "#D9A441" }}>
          <Wheat size={30} color="#4A2E1E" />
        </div>
        <h1 className="font-display text-3xl font-bold mb-2">{settings.name}</h1>
        <p className="text-sm mb-1" style={{ color: "#8A7458" }}>{settings.description}</p>
        <p className="text-xs font-mono mt-2" style={{ color: "#B3A483" }}>{settings.hours} · Solo ritiro in negozio</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <button onClick={() => setView("catalog")} className="col-span-2 py-4 rounded-2xl font-display text-lg font-semibold flex items-center justify-center gap-2" style={{ background: "#4A2E1E", color: "#FBF3E3" }}>
          <ShoppingBag size={18} /> Ordina ora
        </button>
        <button onClick={() => setView("catalog")} className="py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2" style={{ background: "#FFFCF6", border: "1px solid #E9D8AE" }}>
          <Package size={16} /> I nostri prodotti
        </button>
        <a href={mapsUrl} target="_blank" rel="noreferrer" className="py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2" style={{ background: "#FFFCF6", border: "1px solid #E9D8AE" }}>
          <Navigation size={16} /> Come arrivare
        </a>
        <a href={telUrl} className="col-span-2 py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2" style={{ background: "#DEEBDA", color: "#3F6B3A" }}>
          <Phone size={16} /> Chiama {settings.name}
        </a>
      </div>

      <div className="flex items-start gap-2 text-xs mt-4" style={{ color: "#8A7458" }}>
        <MapPin size={14} className="mt-0.5 flex-shrink-0" /> {settings.address}
      </div>
    </div>
  );
}

/* ---------- catalog ---------- */
function Catalog({ products, settings, onAdd }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Tutte");
  const [qtyMap, setQtyMap] = useState({});
  const categories = useMemo(() => ["Tutte", ...new Set(products.map((p) => p.category))], [products]);
  const visible = useMemo(
    () =>
      products
        .filter((p) => p.active !== false)
        .filter((p) => cat === "Tutte" || p.category === cat)
        .filter((p) => !q.trim() || p.name.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => a.order - b.order),
    [products, cat, q]
  );
  const getQty = (id) => qtyMap[id] ?? settings.qtyMin;
  const setQty = (id, v) => setQtyMap((m) => ({ ...m, [id]: Math.min(settings.qtyMax, Math.max(settings.qtyMin, +v.toFixed(2))) }));

  return (
    <div className="pt-4">
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-3" style={{ background: "#FFFCF6", border: "1px solid #E9D8AE" }}>
        <Search size={16} color="#B3A483" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca un prodotto..." className="w-full bg-transparent outline-none text-sm" />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-1 px-1">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className="text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap border"
            style={{ borderColor: cat === c ? "#4A2E1E" : "#E9D8AE", background: cat === c ? "#4A2E1E" : "transparent", color: cat === c ? "#FBF3E3" : "#8A7458" }}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {visible.map((p) => {
          const disabled = !p.available;
          const qty = getQty(p.id);
          return (
            <div key={p.id} className="p-4 rounded-2xl flex items-center gap-3" style={{ background: "#FFFCF6", border: "1px solid #E9D8AE", opacity: disabled ? 0.55 : 1 }}>
              {p.image && (
                <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0">
                  <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-display font-semibold text-base truncate">{p.name}</p>
                <p className="text-xs" style={{ color: "#B3A483" }}>{p.category}</p>
                {p.desc && <p className="text-xs mt-0.5" style={{ color: "#8A7458" }}>{p.desc}</p>}
                <p className="text-sm font-semibold mt-1" style={{ color: "#B5533C" }}>{eur(p.price)} / kg</p>
                {disabled && <p className="text-xs font-semibold mt-1" style={{ color: "#8C3B3B" }}>Non disponibile</p>}
              </div>
              {!disabled && (
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <div className="flex items-center gap-1.5 rounded-full px-1" style={{ background: "#F5EFDD" }}>
                    <button onClick={() => setQty(p.id, qty - settings.qtyStep)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "#FFFCF6" }}>
                      <Minus size={13} />
                    </button>
                    <span className="text-xs font-mono w-10 text-center">{qty} kg</span>
                    <button onClick={() => setQty(p.id, qty + settings.qtyStep)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "#FFFCF6" }}>
                      <Plus size={13} />
                    </button>
                  </div>
                  <button onClick={() => onAdd(p, qty)} className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: "#4A2E1E", color: "#FBF3E3" }}>
                    Aggiungi
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && <p className="text-sm text-center py-10" style={{ color: "#8A7458" }}>Nessun prodotto trovato.</p>}
      </div>
    </div>
  );
}

/* ---------- cart sheet ---------- */
function CartSheet({ items, total, onClose, onQty, onRemove, onClear, onCheckout, settings }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <div className="absolute inset-0" style={{ background: "#00000055" }} onClick={onClose} />
      <div className="relative w-full max-w-3xl rounded-t-3xl p-5 max-h-[80vh] flex flex-col" style={{ background: "#FBF3E3" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-semibold">Il tuo carrello</h2>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <div className="overflow-y-auto flex-1 space-y-3 mb-4">
          {items.length === 0 && <p className="text-sm text-center py-10" style={{ color: "#8A7458" }}>Carrello vuoto.</p>}
          {items.map((i) => (
            <div key={i.productId} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "#FFFCF6", border: "1px solid #E9D8AE" }}>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{i.product.name}</p>
                <p className="text-xs" style={{ color: "#8A7458" }}>{eur(i.product.price)}/kg</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => onQty(i.productId, +(i.qty - settings.qtyStep).toFixed(2))} className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "#F5EFDD" }}><Minus size={11} /></button>
                <span className="text-xs font-mono w-10 text-center">{i.qty} kg</span>
                <button onClick={() => onQty(i.productId, +(i.qty + settings.qtyStep).toFixed(2))} className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "#F5EFDD" }}><Plus size={11} /></button>
              </div>
              <p className="text-sm font-semibold w-16 text-right">{eur(i.subtotal)}</p>
              <button onClick={() => onRemove(i.productId)}><Trash2 size={14} color="#B5533C" /></button>
            </div>
          ))}
        </div>
        {items.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-3 pt-3 border-t" style={{ borderColor: "#E9D8AE" }}>
              <span className="font-display text-lg font-semibold">Totale</span>
              <span className="font-display text-lg font-bold">{eur(total)}</span>
            </div>
            <button onClick={onCheckout} className="w-full py-3.5 rounded-2xl font-semibold" style={{ background: "#4A2E1E", color: "#FBF3E3" }}>
              Procedi all'ordine
            </button>
            <button onClick={onClear} className="w-full py-2 text-xs font-semibold mt-2" style={{ color: "#8C3B3B" }}>Svuota carrello</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- checkout ---------- */
function Checkout({ settings, slots, closures, cartDetailed, cartTotal, onBack, onSubmit, profile }) {
  const [form, setForm] = useState({
    customerName: profile ? `${profile.nome} ${profile.cognome}`.trim() : "",
    phone: profile?.telefono || "",
    email: "",
    notes: "",
    pickupDate: "",
    slotId: "",
  });
  const [orders, setOrders] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    loadShared("pastella:orders", []).then(setOrders);
  }, [form.pickupDate]);

  const minDate = todayISO();
  const maxDate = addDays(todayISO(), 21);
  const closedSet = new Set(closures.map((c) => c.date));
  const isClosed = form.pickupDate && closedSet.has(form.pickupDate);
  const closureReason = isClosed ? closures.find((c) => c.date === form.pickupDate)?.reason : "";

  const availableSlots = useMemo(() => {
    if (!form.pickupDate || isClosed) return [];
    return slots
      .filter((s) => s.active)
      .sort((a, b) => a.order - b.order)
      .map((s) => {
        const count = orders.filter((o) => o.pickupDate === form.pickupDate && o.slotId === s.id && o.status !== "Annullato").length;
        return { ...s, full: count >= s.capacity };
      });
  }, [slots, orders, form.pickupDate, isClosed]);

  const canSubmit = form.customerName.trim() && form.phone.trim() && form.pickupDate && form.slotId && !isClosed;

  const handleSubmit = async () => {
    setErr("");
    setSubmitting(true);
    const ok = await onSubmit(form);
    setSubmitting(false);
    if (!ok) setErr("Questa fascia è stata appena occupata da un altro cliente. Scegline un'altra qui sotto.");
  };

  return (
    <div className="pt-4 pb-6">
      <button onClick={onBack} className="text-sm font-semibold mb-4" style={{ color: "#8A7458" }}>← Torna al catalogo</button>
      <h2 className="font-display text-2xl font-bold mb-4">Completa l'ordine</h2>

      <div className="rounded-2xl p-4 mb-4 space-y-2" style={{ background: "#FFFCF6", border: "1px solid #E9D8AE" }}>
        {cartDetailed.map((i) => (
          <div key={i.productId} className="flex justify-between text-sm">
            <span>{i.qty} kg × {i.product.name}</span>
            <span className="font-semibold">{eur(i.subtotal)}</span>
          </div>
        ))}
        <div className="flex justify-between pt-2 mt-2 border-t font-display font-semibold" style={{ borderColor: "#E9D8AE" }}>
          <span>Totale</span><span>{eur(cartTotal)}</span>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <input placeholder="Nome e cognome *" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: "#E9D8AE" }} />
        <input placeholder="Telefono *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: "#E9D8AE" }} />
        <input placeholder="Email (facoltativa)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: "#E9D8AE" }} />
        <textarea placeholder="Note (facoltative)" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none" style={{ borderColor: "#E9D8AE" }} />
      </div>

      <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#8A7458" }}>Data di ritiro</label>
      <input type="date" min={minDate} max={maxDate} value={form.pickupDate} onChange={(e) => setForm({ ...form, pickupDate: e.target.value, slotId: "" })} className="w-full mt-1 mb-3 px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: "#E9D8AE" }} />

      {isClosed && (
        <div className="flex items-center gap-2 text-sm px-3 py-2.5 rounded-xl mb-3" style={{ background: "#F1DCDC", color: "#8C3B3B" }}>
          <CalendarX size={16} /> Gli ordini per questa data non sono disponibili{closureReason ? ` (${closureReason})` : ""}.
        </div>
      )}

      {form.pickupDate && !isClosed && (
        <>
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#8A7458" }}>Fascia oraria</label>
          <div className="grid grid-cols-3 gap-2 mt-1 mb-4">
            {availableSlots.map((s) => (
              <button
                key={s.id}
                disabled={s.full}
                onClick={() => setForm({ ...form, slotId: s.id })}
                className="py-2 rounded-xl text-xs font-mono font-semibold border"
                style={{
                  borderColor: form.slotId === s.id ? "#4A2E1E" : "#E9D8AE",
                  background: s.full ? "#F1DCDC" : form.slotId === s.id ? "#4A2E1E" : "#FFFCF6",
                  color: s.full ? "#8C3B3B" : form.slotId === s.id ? "#FBF3E3" : "#4A2E1E",
                  opacity: s.full ? 0.7 : 1,
                }}
              >
                {s.label}{s.full ? " · pieno" : ""}
              </button>
            ))}
            {availableSlots.length === 0 && <p className="col-span-3 text-sm" style={{ color: "#8A7458" }}>Nessuna fascia disponibile.</p>}
          </div>
        </>
      )}

      {err && (
        <div className="flex items-center gap-2 text-sm px-3 py-2.5 rounded-xl mb-3" style={{ background: "#F1DCDC", color: "#8C3B3B" }}>
          <AlertCircle size={15} /> {err}
        </div>
      )}

      <div className="rounded-xl px-3 py-2.5 mb-4 text-xs" style={{ background: "#F3E6C4", color: "#8A6A1F" }}>
        Pagamento al ritiro in negozio. Il pagamento online sarà disponibile in futuro.
      </div>

      <button onClick={handleSubmit} disabled={!canSubmit || submitting} className="w-full py-3.5 rounded-2xl font-semibold disabled:opacity-40" style={{ background: "#4A2E1E", color: "#FBF3E3" }}>
        {submitting ? "Invio in corso..." : "Conferma ordine"}
      </button>
    </div>
  );
}

/* ---------- confirmation ---------- */
function Confirmation({ order, settings, slots, products, onDone }) {
  const slot = slots.find((s) => s.id === order.slotId);
  const [startTime] = (slot?.label || "00:00-00:00").split("-");
  const [, endTime] = (slot?.label || "00:00-00:00").split("-");
  const fmt = (d, t) => d.replace(/-/g, "") + "T" + t.replace(":", "") + "00";
  const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
    "Ritiro pasta - " + settings.name
  )}&dates=${fmt(order.pickupDate, startTime)}/${fmt(order.pickupDate, endTime)}&details=${encodeURIComponent(
    `Ordine #${order.orderNumber} pronto per il ritiro.`
  )}&location=${encodeURIComponent(settings.address)}`;

  return (
    <div className="pt-6 pb-6">
      <div className="rounded-3xl p-6 relative" style={{ background: "#FFFCF6", border: "2px dashed #D9A441" }}>
        <div className="text-center mb-4">
          <div className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: "#DEEBDA" }}>
            <Check size={26} color="#3F6B3A" />
          </div>
          <h2 className="font-display text-2xl font-bold">Ordine ricevuto</h2>
          <p className="text-xs font-mono mt-1" style={{ color: "#B3A483" }}>ORDINE #{order.orderNumber}</p>
        </div>
        <div className="space-y-1.5 text-sm mb-4">
          {order.items.map((i) => {
            const p = products.find((x) => x.id === i.productId);
            return (
              <div key={i.productId} className="flex justify-between">
                <span>{i.qty} kg × {p?.name}</span>
              </div>
            );
          })}
        </div>
        <div className="border-t pt-3 mt-2 space-y-1 text-sm" style={{ borderColor: "#E9D8AE" }}>
          <div className="flex justify-between font-display font-semibold text-base"><span>Totale</span><span>{eur(order.total)}</span></div>
          <div className="flex items-center gap-2 mt-2"><CalendarDays size={14} /> {dateLabel(order.pickupDate)}</div>
          <div className="flex items-center gap-2"><Clock size={14} /> {slot?.label}</div>
          <div className="flex items-center gap-2"><MapPin size={14} /> {settings.address}</div>
        </div>
      </div>

      <a href={gcalUrl} target="_blank" rel="noreferrer" className="w-full mt-4 py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2" style={{ background: "#D9A441", color: "#4A2E1E" }}>
        <CalendarPlus size={17} /> Aggiungi promemoria al calendario
      </a>
      <button onClick={onDone} className="w-full py-3 mt-2 rounded-2xl font-semibold text-sm" style={{ color: "#8A7458" }}>
        Torna alla home
      </button>
    </div>
  );
}

/* ---------- history ---------- */
function HistoryView({ orders, products, slots, onReorder }) {
  if (orders.length === 0) {
    return (
      <div className="pt-16 text-center">
        <History size={28} className="mx-auto mb-3" color="#B3A483" />
        <p className="font-display text-lg">Nessun ordine ancora</p>
        <p className="text-sm mt-1" style={{ color: "#8A7458" }}>I tuoi ordini precedenti compariranno qui.</p>
      </div>
    );
  }
  return (
    <div className="pt-4 pb-6 space-y-3">
      <h2 className="font-display text-2xl font-bold mb-2">I tuoi ordini</h2>
      {orders.map((o) => {
        const slot = slots.find((s) => s.id === o.slotId);
        const st = STATUS_COLOR[o.status] || STATUS_COLOR.Ricevuto;
        return (
          <div key={o.id} className="p-4 rounded-2xl" style={{ background: "#FFFCF6", border: "1px solid #E9D8AE" }}>
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="text-xs font-mono" style={{ color: "#B3A483" }}>ORDINE #{o.orderNumber}</p>
                <p className="text-sm font-semibold">{dateLabel(o.pickupDate)} · {slot?.label}</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color: st.c, background: st.bg }}>{o.status}</span>
            </div>
            <div className="text-xs mb-2" style={{ color: "#8A7458" }}>
              {o.items.map((i) => {
                const p = products.find((x) => x.id === i.productId);
                return <div key={i.productId}>{i.qty} kg × {p?.name || "prodotto rimosso"}</div>;
              })}
            </div>
            <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "#E9D8AE" }}>
              <span className="font-semibold text-sm">{eur(o.total)}</span>
              <button onClick={() => onReorder(o.items)} className="text-xs font-semibold flex items-center gap-1 px-3 py-1.5 rounded-full" style={{ background: "#4A2E1E", color: "#FBF3E3" }}>
                <RotateCcw size={12} /> Ordina di nuovo
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- manager login ---------- */
function ManagerLogin({ settings, onSuccess, onCancel }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-3xl p-6 text-center" style={{ background: "#FFFCF6", border: "1px solid #E9D8AE" }}>
        <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: "#4A2E1E" }}>
          <Lock size={20} color="#FBF3E3" />
        </div>
        <h2 className="font-display text-xl font-bold mb-1">Area Gestore</h2>
        <p className="text-xs mb-4" style={{ color: "#8A7458" }}>Inserisci il codice per accedere</p>
        <input
          type="password"
          value={pin}
          onChange={(e) => { setPin(e.target.value); setErr(""); }}
          placeholder="Codice"
          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none text-center mb-3"
          style={{ borderColor: "#E9D8AE" }}
        />
        {err && <p className="text-xs mb-2" style={{ color: "#8C3B3B" }}>{err}</p>}
        <button
          onClick={() => (pin === settings.managerPasscode ? onSuccess() : setErr("Codice errato"))}
          className="w-full py-3 rounded-2xl font-semibold mb-2"
          style={{ background: "#4A2E1E", color: "#FBF3E3" }}
        >
          Accedi
        </button>
        <button onClick={onCancel} className="text-xs font-semibold" style={{ color: "#8A7458" }}>Annulla</button>
      </div>
    </div>
  );
}

/* ---------- manager panel ---------- */
function ManagerPanel({ settings, setSettings, products, setProducts, slots, setSlots, closures, setClosures, orders, setOrders, customers, managerSound, setManagerSound, onTestSound, onStopSound, soundPlaying, onLogout }) {
  const [tab, setTab] = useState("dashboard");
  const tabs = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "orders", label: "Ordini", icon: ShoppingBag },
    { key: "clienti", label: "Clienti", icon: Users },
    { key: "products", label: "Prodotti", icon: Package },
    { key: "slots", label: "Fasce orarie", icon: Timer },
    { key: "closures", label: "Chiusure", icon: CalendarX },
    { key: "settings", label: "Impostazioni", icon: SettingsIcon },
  ];

  return (
    <div className="pt-4 pb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-2xl font-bold">Pannello Gestore</h2>
        <button onClick={onLogout} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-full" style={{ background: "#F1DCDC", color: "#8C3B3B" }}>
          <LogOut size={13} /> Esci
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 mb-5 -mx-1 px-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-full whitespace-nowrap border" style={{ borderColor: tab === key ? "#4A2E1E" : "#E9D8AE", background: tab === key ? "#4A2E1E" : "transparent", color: tab === key ? "#FBF3E3" : "#8A7458" }}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <Dashboard orders={orders} />}
      {tab === "orders" && <OrdersManager orders={orders} setOrders={setOrders} products={products} slots={slots} customers={customers} />}
      {tab === "clienti" && <CustomersManager customers={customers} orders={orders} />}
      {tab === "products" && <ProductsManager products={products} setProducts={setProducts} />}
      {tab === "slots" && <SlotsManager slots={slots} setSlots={setSlots} />}
      {tab === "closures" && <ClosuresManager closures={closures} setClosures={setClosures} />}
      {tab === "settings" && (
        <SettingsManager
          settings={settings}
          setSettings={setSettings}
          managerSound={managerSound}
          setManagerSound={setManagerSound}
          onTestSound={onTestSound}
          onStopSound={onStopSound}
          soundPlaying={soundPlaying}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="p-4 rounded-2xl" style={{ background: "#FFFCF6", border: "1px solid #E9D8AE" }}>
      <p className="font-display text-2xl font-bold" style={{ color: color || "#4A2E1E" }}>{value}</p>
      <p className="text-xs mt-0.5" style={{ color: "#8A7458" }}>{label}</p>
    </div>
  );
}

function Dashboard({ orders }) {
  const today = todayISO();
  const todays = orders.filter((o) => o.pickupDate === today && o.status !== "Annullato");
  const daPreparare = orders.filter((o) => ["Ricevuto", "Confermato", "In preparazione"].includes(o.status)).length;
  const pronti = orders.filter((o) => o.status === "Pronto").length;
  const ritirati = orders.filter((o) => o.status === "Ritirato").length;
  const fatturato = orders.filter((o) => o.status !== "Annullato").reduce((s, o) => s + o.total, 0);
  const upcoming = orders
    .filter((o) => o.pickupDate >= today && o.status !== "Annullato" && o.status !== "Ritirato")
    .sort((a, b) => a.pickupDate.localeCompare(b.pickupDate))
    .slice(0, 5);

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <StatCard label="Ordini oggi" value={todays.length} />
        <StatCard label="Da preparare" value={daPreparare} color="#B5533C" />
        <StatCard label="Pronti" value={pronti} color="#3F6B3A" />
        <StatCard label="Ritirati" value={ritirati} />
      </div>
      <StatCard label="Fatturato totale ordini" value={eur(fatturato)} />
      <h3 className="font-display font-semibold text-lg mt-5 mb-2">Prossimi ritiri</h3>
      <div className="space-y-2">
        {upcoming.length === 0 && <p className="text-sm" style={{ color: "#8A7458" }}>Nessun ritiro imminente.</p>}
        {upcoming.map((o) => (
          <div key={o.id} className="flex justify-between text-sm p-3 rounded-xl" style={{ background: "#FFFCF6", border: "1px solid #E9D8AE" }}>
            <span>#{o.orderNumber} · {o.customerName}</span>
            <span className="font-mono">{dateLabel(o.pickupDate)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrdersManager({ orders, setOrders, products, slots, customers }) {
  const sorted = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const updateStatus = (id, status) => setOrders(orders.map((o) => (o.id === id ? { ...o, status } : o)));
  const findCustomer = (clientToken) => (customers || []).find((c) => c.clientToken === clientToken);
  return (
    <div className="space-y-3">
      {sorted.length === 0 && <p className="text-sm" style={{ color: "#8A7458" }}>Nessun ordine ricevuto.</p>}
      {sorted.map((o) => {
        const slot = slots.find((s) => s.id === o.slotId);
        const cust = findCustomer(o.clientToken);
        return (
          <div key={o.id} className="p-4 rounded-2xl" style={{ background: "#FFFCF6", border: "1px solid #E9D8AE" }}>
            <div className="flex justify-between mb-1">
              <p className="font-semibold text-sm">#{o.orderNumber} · {o.customerName}</p>
              <p className="text-sm font-semibold">{eur(o.total)}</p>
            </div>
            <p className="text-xs mb-2" style={{ color: "#8A7458" }}>
              {o.phone} · {dateLabel(o.pickupDate)} · {slot?.label}
              {cust?.eta ? ` · ${cust.eta} anni` : ""}
            </p>
            <div className="text-xs mb-2" style={{ color: "#8A7458" }}>
              {o.items.map((i) => {
                const p = products.find((x) => x.id === i.productId);
                return <div key={i.productId}>{i.qty} kg × {p?.name}</div>;
              })}
            </div>
            {o.notes && <p className="text-xs italic mb-2" style={{ color: "#8A7458" }}>"{o.notes}"</p>}
            <select value={o.status} onChange={(e) => updateStatus(o.id, e.target.value)} className="text-xs font-semibold px-2 py-1.5 rounded-lg border" style={{ borderColor: "#E9D8AE" }}>
              {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        );
      })}
    </div>
  );
}

function CustomersManager({ customers, orders }) {
  const list = [...(customers || [])].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const countFor = (token) => orders.filter((o) => o.clientToken === token).length;
  return (
    <div className="space-y-2">
      {list.length === 0 && <p className="text-sm" style={{ color: "#8A7458" }}>Nessun cliente registrato.</p>}
      {list.map((c) => (
        <div key={c.clientToken} className="p-4 rounded-2xl flex items-center gap-3" style={{ background: "#FFFCF6", border: "1px solid #E9D8AE" }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#D9A441" }}>
            <User size={16} color="#4A2E1E" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{c.nome} {c.cognome}</p>
            <p className="text-xs" style={{ color: "#8A7458" }}>{c.telefono} · {c.eta} anni</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: "#F3E6C4", color: "#8A6A1F" }}>
            {countFor(c.clientToken)} ordini
          </span>
        </div>
      ))}
    </div>
  );
}

function ProductsManager({ products, setProducts }) {
  const [editing, setEditing] = useState(null);
  const blank = { name: "", category: "", price: "", unit: "kg", desc: "", available: true, active: true, image: "" };
  const [form, setForm] = useState(blank);
  const [uploading, setUploading] = useState(false);
  const categories = [...new Set(products.map((p) => p.category))];

  const save = () => {
    if (!form.name.trim() || !form.category.trim() || !form.price) return;
    const payload = { ...form, price: parseFloat(form.price) };
    if (editing) {
      setProducts(products.map((p) => (p.id === editing ? { ...p, ...payload } : p)));
    } else {
      setProducts([...products, { id: uid(), order: products.length, ...payload }]);
    }
    setForm(blank);
    setEditing(null);
  };
  const edit = (p) => { setForm({ name: p.name, category: p.category, price: String(p.price), unit: p.unit, desc: p.desc || "", available: p.available, active: p.active !== false, image: p.image || "" }); setEditing(p.id); };
  const remove = (id) => setProducts(products.filter((p) => p.id !== id));
  const toggleAvail = (id) => setProducts(products.map((p) => (p.id === id ? { ...p, available: !p.available } : p)));
  const handleImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadProductImage(file);
      setForm((f) => ({ ...f, image: url }));
    } catch (err) {
      console.error(err);
      alert("Caricamento immagine non riuscito. Controlla di aver creato il bucket 'product-images' su Supabase.");
    }
    setUploading(false);
  };

  return (
    <div>
      <div className="p-4 rounded-2xl mb-4 space-y-2" style={{ background: "#FFFCF6", border: "1px solid #E9D8AE" }}>
        <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "#8A7458" }}>{editing ? "Modifica prodotto" : "Nuovo prodotto"}</p>
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: "#F5EFDD", border: "1px solid #E9D8AE" }}>
            {form.image ? <img src={form.image} alt="" className="w-full h-full object-cover" /> : <ImagePlus size={18} color="#B3A483" />}
          </div>
          <label className="text-xs font-semibold px-3 py-2 rounded-lg cursor-pointer" style={{ background: "#F5EFDD", color: "#4A2E1E" }}>
            {uploading ? "Caricamento..." : "Carica foto"}
            <input type="file" accept="image/*" onChange={handleImage} disabled={uploading} className="hidden" />
          </label>
          {form.image && <button onClick={() => setForm((f) => ({ ...f, image: "" }))} className="text-xs font-semibold" style={{ color: "#8C3B3B" }}>Rimuovi</button>}
        </div>
        <input placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: "#E9D8AE" }} />
        <div className="flex gap-2">
          <input placeholder="Categoria" list="cats" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: "#E9D8AE" }} />
          <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          <input placeholder="Prezzo/kg" type="number" step="0.5" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="w-28 px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: "#E9D8AE" }} />
        </div>
        <textarea placeholder="Descrizione (facoltativa)" rows={2} value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none" style={{ borderColor: "#E9D8AE" }} />
        <div className="flex gap-2">
          <button onClick={save} className="flex-1 py-2.5 rounded-lg text-sm font-semibold" style={{ background: "#4A2E1E", color: "#FBF3E3" }}>{editing ? "Salva modifiche" : "Aggiungi prodotto"}</button>
          {editing && <button onClick={() => { setEditing(null); setForm(blank); }} className="px-4 rounded-lg text-sm font-semibold" style={{ background: "#E9D8AE" }}>Annulla</button>}
        </div>
      </div>

      <div className="space-y-2">
        {products.sort((a, b) => a.order - b.order).map((p) => (
          <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "#FFFCF6", border: "1px solid #E9D8AE" }}>
            <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ background: "#F5EFDD" }}>
              {p.image && <img src={p.image} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{p.name}</p>
              <p className="text-xs" style={{ color: "#8A7458" }}>{p.category} · {eur(p.price)}/kg</p>
            </div>
            <button onClick={() => toggleAvail(p.id)} className="text-[10px] font-semibold px-2 py-1 rounded-full" style={{ background: p.available ? "#DEEBDA" : "#F1DCDC", color: p.available ? "#3F6B3A" : "#8C3B3B" }}>
              {p.available ? "Disponibile" : "Esaurito"}
            </button>
            <button onClick={() => edit(p)} className="text-xs font-semibold" style={{ color: "#8A7458" }}>Modifica</button>
            <button onClick={() => remove(p.id)}><Trash2 size={14} color="#B5533C" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlotsManager({ slots, setSlots }) {
  const [form, setForm] = useState({ start: "", end: "", capacity: 1 });
  const add = () => {
    if (!form.start || !form.end) return;
    setSlots([...slots, { id: uid(), label: `${form.start}-${form.end}`, capacity: +form.capacity, active: true, order: slots.length }]);
    setForm({ start: "", end: "", capacity: 1 });
  };
  const update = (id, patch) => setSlots(slots.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const remove = (id) => setSlots(slots.filter((s) => s.id !== id));

  return (
    <div>
      <div className="p-4 rounded-2xl mb-4 flex gap-2 items-end" style={{ background: "#FFFCF6", border: "1px solid #E9D8AE" }}>
        <div className="flex-1">
          <label className="text-xs" style={{ color: "#8A7458" }}>Inizio</label>
          <input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className="w-full px-2 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: "#E9D8AE" }} />
        </div>
        <div className="flex-1">
          <label className="text-xs" style={{ color: "#8A7458" }}>Fine</label>
          <input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className="w-full px-2 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: "#E9D8AE" }} />
        </div>
        <div className="w-16">
          <label className="text-xs" style={{ color: "#8A7458" }}>Posti</label>
          <input type="number" min="1" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className="w-full px-2 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: "#E9D8AE" }} />
        </div>
        <button onClick={add} className="px-3 py-2 rounded-lg" style={{ background: "#4A2E1E" }}><Plus size={16} color="#FBF3E3" /></button>
      </div>
      <div className="space-y-2">
        {slots.sort((a, b) => a.order - b.order).map((s) => (
          <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "#FFFCF6", border: "1px solid #E9D8AE" }}>
            <span className="font-mono text-sm flex-1">{s.label}</span>
            <div className="flex items-center gap-1 text-xs">
              <span style={{ color: "#8A7458" }}>Posti:</span>
              <input type="number" min="1" value={s.capacity} onChange={(e) => update(s.id, { capacity: +e.target.value })} className="w-12 px-1.5 py-1 rounded border text-xs outline-none" style={{ borderColor: "#E9D8AE" }} />
            </div>
            <button onClick={() => update(s.id, { active: !s.active })} className="text-[10px] font-semibold px-2 py-1 rounded-full" style={{ background: s.active ? "#DEEBDA" : "#F1DCDC", color: s.active ? "#3F6B3A" : "#8C3B3B" }}>
              {s.active ? "Attiva" : "Disattiva"}
            </button>
            <button onClick={() => remove(s.id)}><Trash2 size={14} color="#B5533C" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClosuresManager({ closures, setClosures }) {
  const [form, setForm] = useState({ date: "", reason: "" });
  const add = () => {
    if (!form.date) return;
    setClosures([...closures.filter((c) => c.date !== form.date), { date: form.date, reason: form.reason }]);
    setForm({ date: "", reason: "" });
  };
  const remove = (date) => setClosures(closures.filter((c) => c.date !== date));

  return (
    <div>
      <div className="p-4 rounded-2xl mb-4 space-y-2" style={{ background: "#FFFCF6", border: "1px solid #E9D8AE" }}>
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: "#E9D8AE" }} />
        <input placeholder="Motivo (es. ferie, festività)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: "#E9D8AE" }} />
        <button onClick={add} className="w-full py-2.5 rounded-lg text-sm font-semibold" style={{ background: "#4A2E1E", color: "#FBF3E3" }}>Chiudi questa data</button>
      </div>
      <div className="space-y-2">
        {closures.length === 0 && <p className="text-sm" style={{ color: "#8A7458" }}>Nessuna chiusura programmata.</p>}
        {[...closures].sort((a, b) => a.date.localeCompare(b.date)).map((c) => (
          <div key={c.date} className="flex items-center justify-between p-3 rounded-xl" style={{ background: "#FFFCF6", border: "1px solid #E9D8AE" }}>
            <div>
              <p className="text-sm font-semibold">{dateLabel(c.date)}</p>
              {c.reason && <p className="text-xs" style={{ color: "#8A7458" }}>{c.reason}</p>}
            </div>
            <button onClick={() => remove(c.date)} className="text-xs font-semibold" style={{ color: "#8C3B3B" }}>Riapri</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsManager({ settings, setSettings, managerSound, setManagerSound, onTestSound, onStopSound, soundPlaying }) {
  const [form, setForm] = useState(settings);
  const save = () => setSettings(form);
  const handleSound = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setManagerSound(reader.result);
    reader.readAsDataURL(file);
  };
  const field = (key, label, type = "text") => (
    <div className="mb-3">
      <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#8A7458" }}>{label}</label>
      <input type={type} value={form[key]} onChange={(e) => setForm({ ...form, [key]: type === "number" ? +e.target.value : e.target.value })} className="w-full mt-1 px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: "#E9D8AE" }} />
    </div>
  );
  return (
    <div>
      {field("name", "Nome negozio")}
      {field("phone", "Telefono")}
      {field("address", "Indirizzo")}
      {field("hours", "Orario (testo mostrato in home)")}
      <div className="mb-3">
        <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#8A7458" }}>Descrizione home</label>
        <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full mt-1 px-3 py-2.5 rounded-xl border text-sm outline-none resize-none" style={{ borderColor: "#E9D8AE" }} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {field("qtyMin", "Qtà minima (kg)", "number")}
        {field("qtyStep", "Incremento (kg)", "number")}
        {field("qtyMax", "Qtà massima (kg)", "number")}
      </div>
      {field("managerPasscode", "Codice accesso Gestore")}
      <button onClick={save} className="w-full py-3 rounded-2xl font-semibold mt-2" style={{ background: "#4A2E1E", color: "#FBF3E3" }}>Salva impostazioni</button>

      <div className="mt-6 p-4 rounded-2xl" style={{ background: "#FFFCF6", border: "1px solid #E9D8AE" }}>
        <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#8A7458" }}>Suoneria nuovi ordini</p>
        <p className="text-xs mb-3" style={{ color: "#8A7458" }}>Carica un file audio dal tuo telefono (cerca nella cartella Suonerie/Musica). Suonerà in loop quando arriva un ordine, finché non lo fermi tu.</p>
        <label className="inline-block text-xs font-semibold px-3 py-2 rounded-lg cursor-pointer mb-2" style={{ background: "#F5EFDD", color: "#4A2E1E" }}>
          {managerSound ? "Cambia file audio" : "Carica file audio"}
          <input type="file" accept="audio/*" onChange={handleSound} className="hidden" />
        </label>
        {managerSound && <button onClick={() => setManagerSound(null)} className="text-xs font-semibold ml-2" style={{ color: "#8C3B3B" }}>Rimuovi (usa suono predefinito)</button>}
        <div className="flex gap-2 mt-2">
          <button onClick={onTestSound} disabled={soundPlaying} className="text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-40" style={{ background: "#DEEBDA", color: "#3F6B3A" }}>Prova suono</button>
          {soundPlaying && <button onClick={onStopSound} className="text-xs font-semibold px-3 py-2 rounded-lg" style={{ background: "#F1DCDC", color: "#8C3B3B" }}>Ferma</button>}
        </div>
      </div>

      <div className="mt-4 p-3 rounded-xl text-xs" style={{ background: "#F3E6C4", color: "#8A6A1F" }}>
        <p className="font-semibold mb-1">Stato integrazioni</p>
        <p>✅ Ordini, fasce orarie, chiusure, prodotti: funzionanti e salvati.</p>
        <p>✅ Promemoria ritiro: link a Google Calendar funzionante.</p>
        <p>⚠️ Pagamento online: struttura pronta, da collegare a un gestore di pagamenti reale.</p>
        <p>⚠️ Notifiche push automatiche: richiedono configurazione server esterna, non incluse qui.</p>
      </div>
    </div>
  );
}
