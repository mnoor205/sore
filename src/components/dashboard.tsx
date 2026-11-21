"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Store as StoreIcon,
  Users,
  ShoppingBag,
  Ticket,
  Settings,
  CreditCard,
  Sparkles,
  Plus,
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  LogOut,
  FileText,
  Download,
  Search,
  MoreHorizontal,
  GripVertical,
  Eye,
  TrendingUp,
  Link2,
  ShieldCheck,
  Mail,
  BookOpen,
  Loader2,
  Archive,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  CalendarDays,
  ChartNoAxesCombined,
} from "lucide-react";
import LaunchHome from "./launch-home";
import ProductEditor, { type Product } from "./product-editor";
import StoreForm, { type Store } from "./store-form";
import { api, Badge, Empty, Modal, money, Spinner } from "./shared";
type Summary = {
  currency: string;
  paidOrders: number;
  grossProductSales: number;
  refunds: number;
  freeSignups: number;
  definitions: Record<string, string>;
};
type Performance = {
  products: (Product & {
    free: boolean;
    views: number | null;
    trackingStatus: string;
    signups: number;
    paidOrders: number;
    revenue: number;
    sampleCount: number;
  })[];
  limitations: string;
};
type Workspace = {
  store: Store;
  products: Product[];
  summary: Summary;
  performance: Performance;
  entitlement: {
    kind: string;
    status: string;
    paidUntil: number | null;
    graceUntil: number | null;
  } | null;
  mode: string;
  mcpUrl: string;
  feesBps: number;
  ltdPrice: number;
  recurringConfigured: boolean;
  stripeConfigured: boolean;
  limits: { products: number; uploadMB: number; storageMB: number };
};
type Row = {
  id: string;
  name?: string;
  email?: string;
  title?: string;
  amount?: number;
  currency?: string;
  createdAt: number;
  marketing?: number;
  status?: string;
  refunded?: number;
  refundAmount?: number;
  deliveryStatus?: string;
  paymentIntent?: string;
  connectedAccount?: string;
  revokedAt?: number;
  scopes?: string;
  code?: string;
  percent?: number;
  expiresAt?: number;
  maxUses?: number;
  used?: number;
  reserved?: number;
  productId?: string;
};
const navigation = [
  { id: "overview", name: "Home", icon: LayoutDashboard },
  { id: "products", name: "Products", icon: Package },
  { id: "storefront", name: "My storefront", icon: StoreIcon },
  { id: "customers", name: "Customers", icon: Users },
  { id: "orders", name: "Orders", icon: ShoppingBag },
  { id: "discounts", name: "Discounts", icon: Ticket },
];
const settings = [
  { id: "connect-ai", name: "Connect your AI", icon: Sparkles },
  { id: "billing", name: "Plan & billing", icon: CreditCard },
  { id: "settings", name: "Settings", icon: Settings },
];
const descriptions: Record<string, string> = {
  overview: "Bring your products together. Make them ready to share.",
  products: "Your expertise, packaged and ready to share.",
  storefront: "A home for your ideas. Make it feel like you.",
  customers: "The people connecting with your work.",
  orders: "Every purchase, every resource, in one place.",
  discounts: "A little encouragement for the right moment.",
  "connect-ai":
    "Bring your store into the conversations you’re already having.",
  billing: "A simple plan for what comes next.",
  settings: "The details that keep your store running.",
};
export default function Dashboard({ section }: { section: string }) {
  const router = useRouter();
  const [w, setW] = useState<Workspace | null>(null),
    [error, setError] = useState(""),
    [days, setDays] = useState("30"),
    [rows, setRows] = useState<Row[]>([]),
    [search, setSearch] = useState(""),
    [editor, setEditor] = useState<Product | null | false>(false),
    [preview, setPreview] = useState(false),
    [toast, setToast] = useState(""),
    [tab, setTab] = useState("all"),
    [menu, setMenu] = useState(false),
    [busy, setBusy] = useState(""),
    [coupon, setCoupon] = useState(false),
    [definitions, setDefinitions] = useState(false);
  const load = useCallback(async () => {
    try {
      setW(await api<Workspace>(`workspace?days=${days}`));
      setError("");
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes("Create your store")) router.push("/onboarding");
      else setError(message);
    }
  }, [days, router]);
  useEffect(() => {
    load();
  }, [load]);
  const loadRows = useCallback(async () => {
    if (!["customers", "orders", "discounts", "connect-ai"].includes(section))
      return;
    try {
      const path = section === "connect-ai" ? "connections" : section;
      const data = await api<{ items: Row[] }>(
        path + "?search=" + encodeURIComponent(search),
      );
      setRows(data.items);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [section, search]);
  useEffect(() => {
    loadRows();
    setMenu(false);
  }, [loadRows]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  async function action(
    key: string,
    fn: () => Promise<unknown>,
    message: string,
  ) {
    setBusy(key);
    setError("");
    try {
      await fn();
      setToast(message);
      await load();
      await loadRows();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      if (w && text === window.location.origin + "/" + w.store.slug) {
        await api("store/link-copied", {});
        await load();
      }
      setToast("Link copied. Ready when you are.");
    } catch {
      setToast("Copy this address: " + text);
    }
  }
  useEffect(() => {
    if (!w || section !== "products") return;
    const draftId = new URLSearchParams(window.location.search).get("draft");
    if (draftId) {
      const draft = w.products.find((p) => p.id === draftId);
      if (draft) setEditor(draft);
    }
  }, [w?.store.id, section]);
  if (!w)
    return (
      <div className="initial-loading">
        <Link href="/" className="brand">
          <span className="brand-icon">c</span>coachlane.
        </Link>
        {error ? (
          <div className="error-box">
            {error}
            <br />
            <Link href="/sign-in">Open a development workspace</Link>
          </div>
        ) : (
          <Spinner />
        )}
      </div>
    );
  const s = w.store,
    live = w.products.filter((p) => p.state === "published"),
    title =
      section === "overview"
        ? w.summary.paidOrders ||
          w.summary.freeSignups ||
          w.performance.products.some((p) => p.views)
          ? "Your store, at a glance."
          : "Your storefront starts here."
        : section === "storefront"
          ? "My storefront"
          : section === "billing"
            ? "Plan & billing"
            : settings.find((n) => n.id === section)?.name ||
              navigation.find((n) => n.id === section)?.name ||
              "Overview";
  const views = w.performance.products.reduce((a, p) => a + (p.views || 0), 0),
    tasks = [
      {
        name: "Make your storefront yours",
        done: !!s.name && !!s.bio,
        url: "/dashboard/storefront",
      },
      {
        name: "Publish your first resource",
        done: live.length > 0,
        url: "/dashboard/products",
      },
      {
        name: "Connect your payments",
        done: !!s.paymentsReady,
        url: "/dashboard/settings",
      },
      {
        name: "Copy your bio link",
        done: !!s.linkCopiedAt,
        url: `/${s.slug}?preview=1`,
      },
    ],
    complete = tasks.filter((t) => t.done).length;
  const filtered = w.products.filter(
    (p) =>
      (tab === "all" ? p.state !== "archived" : p.state === tab) &&
      p.title.toLowerCase().includes(search.toLowerCase()),
  );
  const addButton = (
    <button className="button primary" onClick={() => setEditor(null)}>
      <Plus size={17} />
      Add product
    </button>
  );
  const dateFilter = (
    <div className="date-filter">
      <CalendarDays size={16} />
      <select
        aria-label="Reporting date range"
        value={days}
        onChange={(e) => setDays(e.target.value)}
      >
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
        <option value="90">Last 90 days</option>
        <option value="365">Last 365 days</option>
      </select>
      <ChevronDown size={14} />
    </div>
  );
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (menu ? "sidebar-open" : "")}>
        <Link className="brand" href="/dashboard">
          <span className="brand-icon">c</span>coachlane
          <span className="wordmark-dot">.</span>
        </Link>
        <button
          className="workspace-switch"
          onClick={() => router.push("/dashboard/storefront")}
        >
          <span className="avatar small">
            {s.name
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")}
          </span>
          <span>
            <b>{s.name}</b>
            <small>{s.demo ? "Demo workspace" : "Creator workspace"}</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <span className="nav-label">YOUR WORKSPACE</span>
        <nav>
          {navigation.map((n) => (
            <Link
              key={n.id}
              href={"/dashboard" + (n.id === "overview" ? "" : "/" + n.id)}
              className={section === n.id ? "active" : ""}
            >
              <n.icon size={19} />
              {n.name}
              {n.id === "products" && (
                <span className="nav-count">
                  {w.products.filter((p) => p.state !== "archived").length}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <span className="nav-label settings-label">MAKE IT YOURS</span>
        <nav>
          {settings.map((n) => (
            <Link
              key={n.id}
              href={"/dashboard/" + n.id}
              className={section === n.id ? "active" : ""}
            >
              <n.icon size={19} />
              {n.name}
              {n.id === "connect-ai" && <span className="new-badge">NEW</span>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span>✳</span>
            <b>
              A small link.
              <br />
              Your next big thing.
            </b>
            <a href="/dashboard/preview" target="_blank" rel="noreferrer">
              Visit your storefront <ExternalLink size={13} />
            </a>
          </div>
          <button
            className="profile-bottom"
            onClick={() =>
              action(
                "logout",
                async () => {
                  if (w.mode !== "development") {
                    window.location.href = "/sign-out";
                    return;
                  }
                  const r = await api<{ url: string }>("signout", {});
                  window.location.href = r.url;
                },
                "Signed out",
              )
            }
          >
            <span className="avatar small">{s.name.slice(0, 1)}</span>
            <span>
              <b>{s.name}</b>
              <small>
                {w.mode === "development"
                  ? "Development account"
                  : "Creator account"}
              </small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      {menu && <div className="sidebar-scrim" onClick={() => setMenu(false)} />}
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={22} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <b>{section === "overview" ? "Overview" : title}</b>
          </div>
          <div className="topbar-actions">
            <span className="mode-pill">
              {s.demo
                ? "Demo workspace"
                : w.mode === "development"
                  ? "Development mode"
                  : "Creator workspace"}
            </span>
            <button
              className="button outline compact"
              onClick={() => setPreview(true)}
            >
              <Eye size={15} />
              Preview store
            </button>
          </div>
        </header>
        <main className="dashboard-content">
          <div className="page-heading">
            <div>
              {section === "overview" && (
                <div className="greeting">MAKE SPACE FOR WHAT’S NEXT</div>
              )}
              <h1>{title}</h1>
              <p>{descriptions[section]}</p>
            </div>
            <div className="actions">
              {section === "overview" &&
                !!(w.summary.paidOrders || w.summary.freeSignups || views) &&
                dateFilter}
              {section === "products" && addButton}
              {section === "discounts" && (
                <button
                  className="button primary"
                  onClick={() => setCoupon(true)}
                >
                  <Plus size={17} />
                  Create discount
                </button>
              )}
              {["customers", "orders"].includes(section) && (
                <a
                  className="button outline"
                  href={
                    "/api/" +
                    section +
                    "?csv=1&search=" +
                    encodeURIComponent(search)
                  }
                >
                  <Download size={16} />
                  Export CSV
                </a>
              )}
            </div>
          </div>
          {error && (
            <div role="alert" className="error-box dismissible">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {section === "overview" &&
            (!live.length ||
              !(w.summary.paidOrders || w.summary.freeSignups || views)) && (
              <LaunchHome
                store={s}
                products={w.products}
                onEdit={setEditor}
                onCopy={() => copy(window.location.origin + "/" + s.slug)}
              />
            )}
          {section === "overview" &&
            live.length > 0 &&
            (w.summary.paidOrders > 0 ||
              w.summary.freeSignups > 0 ||
              views > 0) && (
              <>
                <div className="store-link-strip">
                  <span className="link-mark">
                    <Link2 size={18} />
                  </span>
                  <span>
                    Your storefront is ready for a little attention.
                    <small>
                      {typeof window !== "undefined"
                        ? window.location.host
                        : "coachlane"}
                      /{s.slug}
                    </small>
                  </span>
                  <button
                    onClick={() => copy(window.location.origin + "/" + s.slug)}
                  >
                    <Copy size={15} />
                    Copy link
                  </button>
                  <a
                    href="/dashboard/preview"
                    target="_blank"
                    aria-label="Open storefront"
                    rel="noreferrer"
                  >
                    <ExternalLink size={17} />
                  </a>
                </div>
                <div className="stat-grid">
                  {[
                    {
                      label: "Gross product sales",
                      value: money(w.summary.grossProductSales, s.currency),
                      icon: TrendingUp,
                      note: `${s.currency.toUpperCase()} · excluding tax`,
                    },
                    {
                      label: "Paid orders",
                      value: String(w.summary.paidOrders),
                      icon: ShoppingBag,
                      note: "Confirmed payments",
                    },
                    {
                      label: "Free downloads",
                      value: String(w.summary.freeSignups),
                      icon: Download,
                      note: "Resource requests",
                    },
                    {
                      label: "Product views",
                      value: views ? String(views) : "—",
                      icon: Eye,
                      note: views
                        ? "Measured visitor views"
                        : "No measured views yet",
                    },
                  ].map((m) => (
                    <div className="stat-card" key={m.label}>
                      <div>
                        <span>{m.label}</span>
                        <m.icon size={18} />
                      </div>
                      <strong>{m.value}</strong>
                      <small>{m.note}</small>
                    </div>
                  ))}
                </div>
                <div className="overview-grid">
                  <section className="panel sales-panel">
                    <div className="panel-heading">
                      <h2>Sales overview</h2>
                      <button
                        className="subtle-link"
                        onClick={() => setDefinitions(true)}
                      >
                        How we measure
                      </button>
                    </div>
                    <div className="chart-label">
                      <strong>
                        {money(w.summary.grossProductSales, s.currency)}
                      </strong>
                      <span>
                        Gross product sales <i />{" "}
                        <small>
                          {money(w.summary.refunds, s.currency)} refunded
                        </small>
                      </span>
                    </div>
                    {w.summary.paidOrders === 0 ? (
                      <div className="chart-empty">
                        <div className="chart-grid">
                          <span>{money(10000, s.currency)}</span>
                          <span>{money(5000, s.currency)}</span>
                          <span>{money(0, s.currency)}</span>
                        </div>
                        <div className="chart-empty-copy">
                          <span className="chart-icon">
                            <ChartNoAxesCombined size={22} />
                          </span>
                          <b>Your next chapter starts here.</b>
                          <p>
                            Your first confirmed sale will appear here.
                            <br />
                            For now, make something worth sharing.
                          </p>
                          <button
                            className="button outline compact"
                            onClick={() => setEditor(null)}
                          >
                            <Plus size={15} />
                            Add a product
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="revenue-bars">
                        {w.performance.products
                          .filter((p) => p.revenue > 0)
                          .map((p) => (
                            <div key={p.id}>
                              <span>{p.title}</span>
                              <div>
                                <i
                                  style={{
                                    width: `${(p.revenue / w.summary.grossProductSales) * 100}%`,
                                  }}
                                />
                              </div>
                              <b>{money(p.revenue, s.currency)}</b>
                            </div>
                          ))}
                      </div>
                    )}
                    <div className="chart-footer">
                      <span className="legend-dot" /> Confirmed product sales
                      <span>After discounts · before fees & refunds</span>
                    </div>
                  </section>
                  <section className="panel setup-panel">
                    <div className="panel-heading">
                      <h2>Set up for a good start</h2>
                      <span className="setup-count">{complete} of 4</span>
                    </div>
                    <p>A few little steps. A storefront that’s all you.</p>
                    <div className="progress-track">
                      <i style={{ width: (complete / 4) * 100 + "%" }} />
                    </div>
                    <div className="setup-tasks">
                      {tasks.map((t) => (
                        <Link key={t.name} href={t.url}>
                          <span
                            className={
                              "task-check " + (t.done ? "checked" : "")
                            }
                          >
                            {t.done ? <Check size={13} /> : null}
                          </span>
                          <span className={t.done ? "completed" : ""}>
                            {t.name}
                          </span>
                          <ChevronRight size={15} />
                        </Link>
                      ))}
                    </div>
                    <div className="setup-footnote">
                      <ShieldCheck size={16} />
                      Progress reflects your store setup.
                    </div>
                  </section>
                </div>
                <div className="overview-bottom">
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>
                        Your products{" "}
                        <span className="count-pill">
                          {
                            w.products.filter((p) => p.state !== "archived")
                              .length
                          }
                        </span>
                      </h2>
                      <Link href="/dashboard/products" className="subtle-link">
                        View all products
                      </Link>
                    </div>
                    {live.length ? (
                      <div className="product-mini-list">
                        {live.slice(0, 3).map((p) => (
                          <button key={p.id} onClick={() => setEditor(p)}>
                            <div className="product-thumb">
                              {p.image ? (
                                <img src={p.image} alt="" />
                              ) : (
                                <FileText />
                              )}
                            </div>
                            <span>
                              <b>{p.title}</b>
                              <small>
                                {p.deliveryType === "file"
                                  ? "Digital download"
                                  : "Resource link"}
                              </small>
                            </span>
                            <Badge tone={p.price ? "purple" : "green"}>
                              {p.price ? money(p.price, s.currency) : "Free"}
                            </Badge>
                            <ChevronRight size={16} />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <Empty
                        icon={<Package />}
                        title="Your knowledge belongs here."
                        action={addButton}
                      >
                        Add your first resource to bring your storefront to
                        life.
                      </Empty>
                    )}
                  </section>
                  <section className="ai-card">
                    <div className="ai-card-top">
                      <span className="ai-symbol">✳</span>
                      <Badge tone="dark">YOUR STORE, IN CONTEXT</Badge>
                    </div>
                    <h2>
                      Good questions.
                      <br />
                      Your own store data.
                    </h2>
                    <p>
                      Let your AI see the bigger picture.
                      <br />
                      Connect your catalog and measured
                      <br />
                      performance. Optionally approve private draft saving.
                    </p>
                    <Link
                      href="/dashboard/connect-ai"
                      className="button ai-button"
                    >
                      <Sparkles size={16} />
                      Connect your AI
                    </Link>
                    <span className="ai-card-art">✳</span>
                  </section>
                </div>
                <div className="workspace-footnote">
                  <span>
                    {s.demo
                      ? "Fictional demo catalog. Metrics reflect only recorded test activity."
                      : "Your metrics reflect recorded store activity."}
                  </span>
                  <span>Built for your independent mind.</span>
                </div>
              </>
            )}
          {section === "products" && (
            <>
              <div className="toolbar">
                <div className="tabs">
                  {[
                    ["all", "All products"],
                    ["published", "Published"],
                    ["draft", "Drafts"],
                    ["archived", "Archived"],
                  ].map(([key, label]) => (
                    <button
                      className={tab === key ? "active" : ""}
                      onClick={() => setTab(key)}
                      key={key}
                    >
                      {label}
                      <span>
                        {
                          w.products.filter((p) =>
                            key === "all"
                              ? p.state !== "archived"
                              : p.state === key,
                          ).length
                        }
                      </span>
                    </button>
                  ))}
                </div>
                <div className="search-input">
                  <Search size={17} />
                  <input
                    placeholder="Find a product…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="product-card-grid">
                {filtered.map((p) => (
                  <article className="catalog-card" key={p.id}>
                    <button
                      className="catalog-cover"
                      aria-label={"Edit " + p.title}
                      onClick={() => setEditor(p)}
                    >
                      {p.image ? (
                        <img src={p.image} alt={p.title + " preview"} />
                      ) : (
                        <div className="cover-fallback">
                          <FileText size={40} />
                          {p.title}
                        </div>
                      )}
                      <span className="cover-badge">
                        <Badge
                          tone={p.state === "published" ? "green" : "gray"}
                        >
                          {p.state}
                        </Badge>
                      </span>
                    </button>
                    <div className="catalog-details">
                      <span className="micro-label">
                        {p.kind === "link"
                          ? "EXTERNAL LINK"
                          : p.deliveryType === "file"
                            ? "DIGITAL DOWNLOAD"
                            : "RESOURCE LINK"}
                      </span>
                      <h3>{p.title}</h3>
                      <p>
                        {p.description ||
                          "A new resource, ready for your words."}
                      </p>
                      <div className="catalog-price">
                        <strong>
                          {p.price ? money(p.price, s.currency) : "Free"}
                        </strong>
                        <span>
                          {w.performance.products.find((x) => x.id === p.id)
                            ?.paidOrders || 0}{" "}
                          paid orders
                        </span>
                      </div>
                      <div className="catalog-actions">
                        <button
                          className="button outline compact"
                          onClick={() => setEditor(p)}
                        >
                          Edit product
                        </button>
                        <button
                          className="icon-button"
                          title="Copy product link"
                          aria-label={"Copy link for " + p.title}
                          onClick={() =>
                            copy(
                              window.location.origin +
                                "/" +
                                s.slug +
                                "/p/" +
                                p.id,
                            )
                          }
                        >
                          <Copy size={16} />
                        </button>
                        <button
                          className="icon-button"
                          title="Move up"
                          aria-label={"Move " + p.title + " up"}
                          disabled={p.position === 0 || !!busy}
                          onClick={() =>
                            action(
                              "reorder",
                              async () => {
                                const list = [...w.products].sort(
                                    (a, b) => a.position - b.position,
                                  ),
                                  index = list.findIndex((x) => x.id === p.id);
                                if (index > 0)
                                  [list[index - 1], list[index]] = [
                                    list[index],
                                    list[index - 1],
                                  ];
                                await api("reorder", {
                                  ids: list.map((x) => x.id),
                                });
                              },
                              "Product order updated",
                            )
                          }
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          className="icon-button"
                          title="Archive product"
                          aria-label={"Archive " + p.title}
                          disabled={p.state === "archived" || !!busy}
                          onClick={() =>
                            action(
                              "archive",
                              () => api("products/" + p.id, {}, "DELETE"),
                              "Product archived. Existing orders are preserved.",
                            )
                          }
                        >
                          <Archive size={16} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
                <button
                  className="add-product-card"
                  onClick={() => setEditor(null)}
                >
                  <span>
                    <Plus size={25} />
                  </span>
                  <b>What’s your next idea?</b>
                  <p>
                    Add a workbook, template,
                    <br />
                    or a helpful little resource.
                  </p>
                  <small>Add product</small>
                </button>
              </div>
              <div className="info-line">
                <ShieldCheck size={16} />
                <span>
                  Paid files and delivery links stay private. Archiving
                  preserves existing buyer access.
                </span>
                <span>
                  {w.products.length} / {w.limits.products} products
                </span>
              </div>
            </>
          )}
          {section === "storefront" && (
            <div className="storefront-layout">
              <section className="panel settings-panel">
                <StoreForm
                  store={s}
                  onSaved={() => {
                    load();
                    setToast("Your storefront has been updated.");
                  }}
                />
              </section>
              <aside className="sticky-preview">
                <div className="preview-label">
                  <span>YOUR STOREFRONT</span>
                  <button
                    className="icon-button"
                    aria-label="Copy storefront link"
                    onClick={() => copy(window.location.origin + "/" + s.slug)}
                  >
                    <Copy size={16} />
                  </button>
                </div>
                <div className="phone-preview">
                  <iframe
                    title="Mobile storefront preview"
                    src="/dashboard/preview"
                    loading="lazy"
                  />
                </div>
                <button
                  className="button outline wide"
                  onClick={() => setPreview(true)}
                >
                  <Eye size={16} />
                  Open full preview
                </button>
              </aside>
            </div>
          )}
          {["customers", "orders"].includes(section) && (
            <section className="panel">
              <div className="table-toolbar">
                <h2>
                  {section === "orders" ? "All orders" : "Your contacts"}{" "}
                  <span className="count-pill">{rows.length}</span>
                </h2>
                <div className="search-input">
                  <Search size={17} />
                  <input
                    aria-label="Search by email"
                    placeholder="Search by email…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              {rows.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {(section === "orders"
                          ? [
                              "Product / customer",
                              "Amount",
                              "Payment",
                              "Delivery",
                              "Date",
                              "",
                            ]
                          : ["Customer", "Marketing opt-in", "Joined"]
                        ).map((h, i) => (
                          <th key={i}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <b>{section === "orders" ? r.title : r.name}</b>
                            <small>{r.email}</small>
                          </td>
                          {section === "orders" ? (
                            <>
                              <td>
                                {money(r.amount || 0, r.currency)}
                                <small>
                                  {r.currency?.toUpperCase()} · tax excluded
                                </small>
                              </td>
                              <td>
                                <Badge
                                  tone={
                                    r.refunded
                                      ? "gray"
                                      : r.status === "paid"
                                        ? "green"
                                        : "gray"
                                  }
                                >
                                  {r.refunded ? "Refunded" : r.status}
                                </Badge>
                              </td>
                              <td>
                                <span className="delivery-state">
                                  {r.deliveryStatus === "development"
                                    ? "Dev: not sent"
                                    : r.deliveryStatus?.replaceAll("_", " ") ||
                                      "Awaiting"}
                                </span>
                              </td>
                              <td>
                                {new Date(r.createdAt).toLocaleDateString()}
                              </td>
                              <td>
                                <div className="table-actions">
                                  <button
                                    className="icon-button"
                                    title="Resend access"
                                    aria-label="Resend access"
                                    disabled={
                                      !!busy ||
                                      !["paid", "free"].includes(
                                        r.status || "",
                                      ) ||
                                      !!r.refunded
                                    }
                                    onClick={() =>
                                      action(
                                        "resend",
                                        () =>
                                          api("orders/resend", {
                                            orderId: r.id,
                                          }),
                                        w.mode === "development"
                                          ? "Development email recorded; no email sent."
                                          : "Access email queued.",
                                      )
                                    }
                                  >
                                    <Mail size={17} />
                                  </button>
                                  {r.paymentIntent &&
                                    !r.paymentIntent.startsWith("dev_") && (
                                      <a
                                        className="icon-button"
                                        title="Manage refund in Stripe"
                                        href={`https://dashboard.stripe.com/${r.connectedAccount}/payments/${r.paymentIntent}`}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        <ExternalLink size={16} />
                                      </a>
                                    )}
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td>
                                <Badge tone={r.marketing ? "green" : "gray"}>
                                  {r.marketing ? "Opted in" : "Delivery only"}
                                </Badge>
                              </td>
                              <td>
                                {new Date(r.createdAt).toLocaleDateString()}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="table-note">
                    Showing up to 200 records. CSV export includes up to 10,000
                    matching records.
                  </p>
                </div>
              ) : (
                <Empty
                  icon={section === "orders" ? <ShoppingBag /> : <Users />}
                  title={
                    search
                      ? "No matches yet."
                      : section === "orders"
                        ? "Your first order starts a story."
                        : "Good connections start here."
                  }
                >
                  {search
                    ? "Try another email address."
                    : section === "orders"
                      ? "Confirmed sales and free-resource deliveries will appear here."
                      : "Share a free resource to start collecting contacts. Marketing opt-in stays optional."}
                </Empty>
              )}
            </section>
          )}
          {section === "discounts" && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Product discounts</h2>
                <span className="muted">One code per checkout</span>
              </div>
              {rows.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Product</th>
                        <th>Discount</th>
                        <th>Redemptions</th>
                        <th>Expires</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <code>{r.code}</code>
                          </td>
                          <td>
                            {w.products.find((p) => p.id === r.productId)
                              ?.title || "Archived product"}
                          </td>
                          <td>{r.percent}% off</td>
                          <td>
                            {r.used} / {r.maxUses}
                            <small>{r.reserved} reserved checkouts</small>
                          </td>
                          <td>
                            {new Date(r.expiresAt!).toLocaleDateString()}
                            <small>
                              {r.expiresAt! < Date.now() ? "Expired" : "Active"}
                            </small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  icon={<Ticket />}
                  title="A thoughtful little incentive."
                  action={
                    <button
                      className="button outline"
                      onClick={() => setCoupon(true)}
                    >
                      Create your first discount
                    </button>
                  }
                >
                  Create a percentage discount for one paid product, with an
                  expiry date and a redemption limit.
                </Empty>
              )}
            </section>
          )}
          {section === "connect-ai" && (
            <div className="connect-layout">
              <div>
                <section className="panel integration-panel">
                  <div className="integration-icon">
                    <Sparkles size={25} />
                  </div>
                  <h2>Your store. Your AI. More context.</h2>
                  <p>
                    Connect a compatible AI client to draft product copy from
                    your material, then review it before publishing. You can
                    also share your catalog and measured store performance. Your
                    AI provides the reasoning. Coachlane provides the authorized
                    context.
                  </p>
                  <div className="permission-grid">
                    <span>
                      <Check size={16} />
                      Product catalog
                    </span>
                    <span>
                      <Check size={16} />
                      Aggregate sales
                    </span>
                    <span>
                      <ShieldCheck size={16} />
                      Draft-only writes by permission
                    </span>
                    <span>
                      <ShieldCheck size={16} />
                      No customer details
                    </span>
                  </div>
                  <label>
                    Your MCP endpoint
                    <div className="copy-input">
                      <input readOnly value={w.mcpUrl} />
                      <button
                        className="icon-button"
                        aria-label="Copy MCP endpoint"
                        onClick={() => copy(w.mcpUrl)}
                      >
                        <Copy size={17} />
                      </button>
                    </div>
                  </label>
                  <div className="notice">
                    <b>
                      {w.mode === "development"
                        ? "Local endpoint · separate MCP worker required"
                        : "Remote endpoint · OAuth required · optional draft-write scope"}
                    </b>
                    <p>
                      Run the MCP worker, then add this URL as a remote
                      Streamable HTTP connector in your client. Sign in to
                      Coachlane and approve <code>store:read</code>. To save
                      drafts, also request <code>products:draft:write</code> and
                      explicitly check its consent box. Draft access cannot
                      publish, delete, or change live prices. Production
                      requires HTTPS.
                    </p>
                  </div>
                  <p className="fine-print">
                    Real-client compatibility: ChatGPT and Claude are untested.
                    SDK transport and OAuth verification results are recorded in
                    the implementation report.
                  </p>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Connected clients</h2>
                    <Badge>store:read</Badge>
                  </div>
                  {rows.length ? (
                    <div className="connection-list">
                      {rows.map((r) => (
                        <div key={r.id}>
                          <span className="icon-square lavender">
                            <Sparkles size={18} />
                          </span>
                          <span>
                            <b>{r.name}</b>
                            <small>
                              {r.scopes?.includes("products:draft:write")
                                ? "Read + private draft saving"
                                : "Read only"}
                            </small>
                            <small>
                              Connected{" "}
                              {new Date(r.createdAt).toLocaleDateString()}
                            </small>
                          </span>
                          {r.revokedAt ? (
                            <Badge>Revoked</Badge>
                          ) : (
                            <button
                              className="button outline compact"
                              disabled={!!busy}
                              onClick={() =>
                                action(
                                  "revoke",
                                  () => api("connections/revoke", { id: r.id }),
                                  "Connection revoked. Its access is blocked immediately.",
                                )
                              }
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty icon={<Link2 />} title="Nothing connected yet.">
                      Connections appear here after an authenticated client
                      receives your approval.
                    </Empty>
                  )}
                </section>
              </div>
              <aside>
                <section className="prompt-card">
                  <span className="eyebrow purple">
                    START A GOOD CONVERSATION
                  </span>
                  <h3>A little inspiration.</h3>
                  {[
                    "Use this workbook and audience description to draft my product page. Save it as a draft for me to review.",
                    "Review my catalog for unclear descriptions and missing information. Separate observations from suggestions.",
                    "Summarize my sales for the last 30 days.",
                    "Which products received views but few purchases?",
                    "Review my product descriptions for my stated audience.",
                    "Suggest an experiment, distinguishing observations from assumptions.",
                  ].map((p) => (
                    <button key={p} onClick={() => copy(p)}>
                      <span>“{p}”</span>
                      <Copy size={14} />
                    </button>
                  ))}
                </section>
                <section className="panel fallback-card">
                  <Download size={23} />
                  <h3>Prefer a file?</h3>
                  <p>
                    Download your catalog and 30-day aggregate metrics as an AI
                    context report. No customer personal information.
                  </p>
                  <a className="button outline wide" href="/api/ai-report">
                    <Download size={16} />
                    Download context report
                  </a>
                </section>
              </aside>
            </div>
          )}
          {section === "billing" && (
            <>
              <div className="current-plan panel">
                <span className="icon-square lavender">
                  <CreditCard />
                </span>
                <div>
                  <span className="micro-label">YOUR CURRENT ENTITLEMENT</span>
                  <h2>
                    {w.entitlement?.kind === "lifetime"
                      ? "Founding lifetime"
                      : w.entitlement?.kind === "subscription"
                        ? "Subscription"
                        : s.demo
                          ? "Development demo"
                          : "No active plan"}
                  </h2>
                  <p>
                    {w.entitlement
                      ? `Status: ${w.entitlement.status}. Existing buyer access is preserved if billing lapses.`
                      : "Activate a plan to accept new checkouts in production."}
                  </p>
                </div>
                <button
                  className="button outline"
                  disabled={!!busy}
                  onClick={() =>
                    action(
                      "portal",
                      async () => {
                        const r = await api<{ url: string }>(
                          "billing/portal",
                          {},
                        );
                        window.location.href = r.url;
                      },
                      "Opening billing portal",
                    )
                  }
                >
                  Manage billing
                </button>
              </div>
              <div className="pricing-grid">
                <section className="pricing-card featured">
                  <Badge tone="purple">FOUNDING OFFER</Badge>
                  <h2>A place to begin.</h2>
                  <div className="plan-price">
                    {money(w.ltdPrice)}
                    <span>one time · USD</span>
                  </div>
                  <p>
                    A limited founding lifetime entitlement to the capabilities
                    and quotas you purchase.
                  </p>
                  <ul>
                    <li>
                      <Check size={17} />
                      {w.limits.products} products
                    </li>
                    <li>
                      <Check size={17} />
                      {w.limits.storageMB} MB private storage
                    </li>
                    <li>
                      <Check size={17} />
                      Storefront, delivery & reporting
                    </li>
                    <li>
                      <Check size={17} />
                      AI connection · draft assistance
                    </li>
                  </ul>
                  <button
                    className="button primary wide"
                    disabled={!!busy}
                    onClick={() =>
                      action(
                        "ltd",
                        async () => {
                          const r = await api<{ url: string }>(
                            "billing/checkout",
                            { kind: "lifetime" },
                          );
                          window.location.href = r.url;
                        },
                        "Opening checkout",
                      )
                    }
                  >
                    Get founding lifetime access
                  </button>
                  <small>
                    Offer availability is enforced at checkout. No automatic
                    conversion to a subscription.
                  </small>
                </section>
                <section className="pricing-card">
                  <Badge>RECURRING PLAN</Badge>
                  <h2>Room to keep building.</h2>
                  <div className="plan-price">
                    {w.recurringConfigured ? "Subscription" : "Pricing to come"}
                    <span>
                      {w.recurringConfigured
                        ? "Configured in Stripe"
                        : "No monthly price has been validated"}
                    </span>
                  </div>
                  <p>
                    Recurring billing for subsequent customers. Price and usage
                    limits are centrally configurable.
                  </p>
                  <ul>
                    <li>
                      <Check size={17} />
                      Same core storefront capabilities
                    </li>
                    <li>
                      <Check size={17} />
                      Hosted invoices & billing portal
                    </li>
                    <li>
                      <Check size={17} />
                      Cancel through your billing portal
                    </li>
                    <li>
                      <Check size={17} />
                      7-day failed-payment grace period
                    </li>
                  </ul>
                  <button
                    className="button outline wide"
                    disabled={!w.recurringConfigured || !!busy}
                    onClick={() =>
                      action(
                        "subscription",
                        async () => {
                          const r = await api<{ url: string }>(
                            "billing/checkout",
                            { kind: "subscription" },
                          );
                          window.location.href = r.url;
                        },
                        "Opening checkout",
                      )
                    }
                  >
                    {w.recurringConfigured
                      ? "Choose subscription"
                      : "Recurring price not configured"}
                  </button>
                  <small>
                    Limits shown here are engineering assumptions, not
                    researched requirements.
                  </small>
                </section>
              </div>
              <div className="notice">
                <b>What happens if billing lapses?</b>
                <p>
                  After the 7-day failed-payment grace period, new checkouts
                  pause. Exports and previously purchased access remain
                  available. Lifetime entitlements do not expire with
                  subscriptions. A full lifetime-purchase refund revokes that
                  entitlement.
                </p>
              </div>
            </>
          )}
          {section === "settings" && (
            <div className="settings-stack">
              <section className="panel settings-panel">
                <div className="section-icon">
                  <CreditCard size={22} />
                  <div>
                    <h2>Creator payments</h2>
                    <p>Your customers pay you directly through Stripe.</p>
                  </div>
                  <Badge tone={s.paymentsReady ? "green" : "gray"}>
                    {s.paymentsReady ? "Payments enabled" : "Setup required"}
                  </Badge>
                </div>
                <p>
                  Complete Stripe-hosted onboarding to accept payments. Sales
                  belong to your connected account. Manage payments, refunds,
                  and disputes in your full Stripe Dashboard.
                </p>
                <div className="actions">
                  <button
                    className="button primary"
                    disabled={!!busy || !s.supportEmail}
                    onClick={() =>
                      action(
                        "connect",
                        async () => {
                          const r = await api<{ url: string }>(
                            "payments/connect",
                            {},
                          );
                          window.location.href = r.url;
                        },
                        "Opening Stripe onboarding",
                      )
                    }
                  >
                    <CreditCard size={17} />
                    {s.stripeAccount
                      ? "Continue Stripe setup"
                      : "Connect Stripe"}
                  </button>
                  {s.stripeAccount && (
                    <>
                      <button
                        className="button outline"
                        disabled={!!busy}
                        onClick={() =>
                          action(
                            "refresh",
                            () => api("payments/refresh", {}),
                            "Payment status refreshed",
                          )
                        }
                      >
                        <RefreshCw size={16} />
                        Refresh status
                      </button>
                      <a
                        className="button outline"
                        href={`https://dashboard.stripe.com/${s.stripeAccount}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Stripe Dashboard <ExternalLink size={15} />
                      </a>
                    </>
                  )}
                </div>
                {!w.stripeConfigured && (
                  <div className="notice">
                    Stripe API credentials are not configured for this
                    workspace.
                  </div>
                )}
                <div className="fees-grid">
                  <div>
                    <small>Platform transaction fee</small>
                    <b>{w.feesBps / 100}%</b>
                  </div>
                  <div>
                    <small>Stripe processing fees</small>
                    <b>Charged by Stripe</b>
                  </div>
                  <div>
                    <small>Settlement currency</small>
                    <b>{s.currency.toUpperCase()}</b>
                  </div>
                </div>
                <p className="fine-print">
                  Stripe sets processing fees and collects them from your
                  connected account. Product-sale taxes are the creator’s
                  responsibility. Tax calculation is disabled until
                  registrations and tax settings are verified; this app does not
                  remit taxes for you.
                </p>
              </section>
              <section className="panel settings-panel">
                <h2>Account & data</h2>
                <p>
                  Sign in with a one-time code sent to your email through
                  Cloudflare. No password to remember. Development sessions are
                  explicitly local simulations.
                </p>
                <div className="actions">
                  <Link className="button outline" href="/dashboard/storefront">
                    Edit store profile
                  </Link>
                  <a className="button outline" href="/api/customers?csv=1">
                    <Download size={16} />
                    Export contacts
                  </a>
                  <a className="button outline" href="/api/orders?csv=1">
                    <Download size={16} />
                    Export orders
                  </a>
                </div>
              </section>
              <div className="notice">
                <b>Engineering defaults</b>
                <p>
                  {w.limits.products} products · {w.limits.uploadMB} MB per
                  upload · {w.limits.storageMB} MB total storage. These initial
                  limits are configurable assumptions. No video hosting,
                  courses, memberships, or coaching bookings.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
      {editor !== false && (
        <ProductEditor
          product={editor || undefined}
          currency={s.currency}
          onClose={() => setEditor(false)}
          onSaved={() => {
            setEditor(false);
            load();
            setToast("Your product is saved. Good things ahead.");
          }}
        />
      )}
      {preview && (
        <Modal
          title="A little preview of your storefront"
          onClose={() => setPreview(false)}
        >
          <div className="preview-modal">
            <div className="preview-url">
              {s.slug} <Badge>Creator preview · views excluded</Badge>
            </div>
            <div className="phone-preview">
              <iframe
                title="Storefront mobile preview"
                src="/dashboard/preview"
              />
            </div>
            <a
              className="button outline wide"
              target="_blank"
              rel="noreferrer"
              href="/dashboard/preview"
            >
              Open storefront <ExternalLink size={16} />
            </a>
          </div>
        </Modal>
      )}
      {coupon && (
        <DiscountForm
          products={w.products}
          onClose={() => setCoupon(false)}
          onSaved={() => {
            setCoupon(false);
            loadRows();
            setToast("Your discount is ready.");
          }}
        />
      )}
      {definitions && (
        <Modal
          title="Measured, not imagined."
          onClose={() => setDefinitions(false)}
        >
          <div className="definitions-list">
            {Object.entries(w.summary.definitions).map(([key, value]) => (
              <div key={key}>
                <b>{key.replace(/([A-Z])/g, " $1")}</b>
                <p>{value}</p>
              </div>
            ))}
            <p>{w.performance.limitations}</p>
          </div>
        </Modal>
      )}
      {toast && (
        <div role="status" className="toast">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
function DiscountForm({
  products,
  onClose,
  onSaved,
}: {
  products: Product[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Create a little incentive" onClose={onClose}>
      <form
        className="discount-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await api("discounts", {
              productId: f.get("productId"),
              code: f.get("code"),
              percent: Number(f.get("percent")),
              maxUses: Number(f.get("maxUses")),
              expiresAt: new Date(String(f.get("expiresAt"))).getTime(),
            });
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Paid product
          <select name="productId" required>
            <option value="">Choose a product</option>
            {products
              .filter((p) => p.price > 0 && p.kind === "resource")
              .map((p) => (
                <option value={p.id} key={p.id}>
                  {p.title}
                </option>
              ))}
          </select>
        </label>
        <label>
          Discount code
          <input
            name="code"
            required
            placeholder="e.g. FRESHSTART"
            pattern="[A-Za-z0-9_-]+"
            minLength={2}
            maxLength={40}
          />
        </label>
        <div className="form-row">
          <label>
            Percentage off
            <input
              name="percent"
              type="number"
              min="1"
              max="99"
              required
              defaultValue="15"
            />
          </label>
          <label>
            Total redemption limit
            <input
              name="maxUses"
              type="number"
              min="1"
              max="100000"
              required
              defaultValue="20"
            />
          </label>
        </div>
        <label>
          Expires at (your local time)
          <input
            name="expiresAt"
            type="datetime-local"
            required
            min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
          />
        </label>
        <p className="fine-print">
          Availability is checked and reserved on the server. Pending checkouts
          count toward the limit until paid or expired.
        </p>
        {error && (
          <div role="alert" className="error-box">
            {error}
          </div>
        )}
        <button className="button primary wide" disabled={busy}>
          {busy && <Loader2 className="spin" size={16} />}Create discount
        </button>
      </form>
    </Modal>
  );
}
