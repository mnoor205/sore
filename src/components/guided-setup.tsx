"use client";
import Brand, { Wordmark } from "./brand";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  Loader2,
  Eye,
  ShieldCheck,
  FileText,
  CreditCard,
  ExternalLink,
  Save,
  Package,
  Download,
} from "lucide-react";
import { api, Badge, Spinner, money } from "./shared";
import AssetUpload from "./asset-upload";
import ProductEditor, { type Product } from "./product-editor";
import { setupContentSchema, type SetupContent } from "@/lib/onboarding-types";
import { presets } from "@/lib/presentation";
import type { Store } from "./store-form";
import StanImport, { type StanPreview } from "./stan-import";
import type { StanProduct } from "@/lib/stan-import";
type Setup = {
  ownerId: string;
  step: number;
  content: SetupContent;
  store: Store | null;
  product: Product | null;
  version: number;
  completed: boolean;
  mode: string;
  updatedAt: number;
};
// Stan keeps full-size originals (often 8 MB+); its CDN serves resized copies at fixed presets.
const stanResized = (url: string, preset: string) => {
  if (!url || !/(^|\.)stanwith\.me$/.test(new URL(url).hostname)) return url;
  const base = url
    .split("/")
    .at(-1)!
    .replace(/\.[^.]*$/, "");
  return `${url}/webp/${preset}/${base}.webp`;
};
const slugFrom = (handle: string) =>
  handle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^[^a-z]+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
const steps = [
  { title: "You & your audience", detail: "A little introduction" },
  { title: "Your first product", detail: "Bring what you already have" },
  { title: "Make it feel like you", detail: "Choose your appearance" },
  { title: "See it come together", detail: "Review your real storefront" },
  { title: "Ready for the world", detail: "Check delivery and publish" },
];
export default function GuidedSetup() {
  const [state, setState] = useState<Setup | null>(null),
    [content, setContent] = useState<SetupContent>(
      setupContentSchema.parse({}),
    ),
    [step, setStep] = useState(1),
    [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<"store" | "product">("store"),
    [edit, setEdit] = useState(false),
    [test, setTest] = useState<{ url: string; notice: string } | null>(null),
    [stan, setStan] = useState(false),
    [stanImported, setStanImported] = useState("");
  const version = useRef(1),
    ready = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    chain = useRef<Promise<unknown>>(Promise.resolve());
  const accept = useCallback((s: Setup, replace = true) => {
    version.current = s.version;
    setState(s);
    if (replace) {
      setContent(s.content);
      setStep(s.step);
    }
  }, []);
  useEffect(() => {
    api<Setup>("setup")
      .then((s) => {
        accept(s);
        ready.current = true;
      })
      .catch((e) => {
        if (e.message.includes("sign in") || e.message.includes("Sign in"))
          window.location.href =
            "/sign-in?redirect_url=" +
            encodeURIComponent(window.location.origin + "/onboarding");
        else setError(e.message);
      });
  }, [accept]);
  const persist = useCallback((draft: SetupContent, target: number) => {
    setSaving(true);
    const promise = chain.current
      .catch(() => {})
      .then(async () => {
        const s = await api<Setup>("setup", {
          expectedVersion: version.current,
          step: target,
          content: draft,
        });
        version.current = s.version;
        setState(s);
        return s;
      });
    chain.current = promise;
    promise.catch((e) => setError(e.message)).finally(() => setSaving(false));
    return promise;
  }, []);
  useEffect(() => {
    if (!ready.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void persist(content, step).catch(() => {});
    }, 500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [content, step, persist]);
  const updateCreator = (key: keyof SetupContent["creator"], value: string) =>
    setContent((c) => ({ ...c, creator: { ...c.creator, [key]: value } }));
  const updateProduct = (patch: Partial<SetupContent["product"]>) =>
    setContent((c) => ({ ...c, product: { ...c.product, ...patch } }));
  function prefillFromStan(source: StanPreview, product: StanProduct | null) {
    setContent((c) => ({
      ...c,
      creator: {
        ...c.creator,
        name: c.creator.name || source.name,
        slug: c.creator.slug || slugFrom(source.handle),
        bio: c.creator.bio || source.bio,
        photo: c.creator.photo || stanResized(source.photo, "433x0/85"),
        supportEmail: c.creator.supportEmail || source.supportEmail,
        currency: source.currencySupported
          ? (source.currency as SetupContent["creator"]["currency"])
          : c.creator.currency,
      },
      product: product
        ? {
            ...c.product,
            title: product.title,
            description: product.description,
            image: stanResized(product.image, "1200x0/100"),
            buttonLabel: product.buttonLabel,
            isPaid: product.price > 0,
            price: product.price,
            deliveryType: product.deliveryType,
            deliveryUrl: product.deliveryUrl,
            assetId: null,
          }
        : c.product,
    }));
    setStan(false);
    setStanImported(
      "Imported from stan.store/" +
        source.handle +
        ". Review each step; " +
        (product?.note ? product.note + " " : "") +
        "Once setup is done, bring in your other products from Products → Import from Stan.",
    );
  }
  async function next() {
    setError("");
    setBusy(true);
    if (timer.current) clearTimeout(timer.current);
    try {
      await persist(content, step);
      const s = await api<Setup>("setup/step", { step });
      accept(s);
      if (step === 5) setTest(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function leave() {
    setBusy(true);
    if (timer.current) clearTimeout(timer.current);
    try {
      await persist(content, step);
      window.location.href = "/dashboard";
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function rehearsal() {
    if (!state?.product) return;
    setBusy(true);
    setError("");
    try {
      setTest(await api("setup/rehearse", { productId: state.product.id }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function connect() {
    setBusy(true);
    setError("");
    try {
      await persist(content, step);
      const r = await api<{ url: string }>("payments/connect", {});
      window.location.href = r.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function refreshPayments() {
    setBusy(true);
    try {
      await api("payments/refresh", {});
      accept(await api<Setup>("setup"), false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!state)
    return (
      <div className="setup-loading">
        <Spinner />
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
      </div>
    );
  const current = steps[step - 1],
    p = state.product,
    s = state.store,
    paid = !!p?.price;
  return (
    <div className="guided-setup">
      <header className="setup-header">
        <Brand />
        <div className="actions">
          <span className="save-status" role="status">
            {saving ? (
              <>
                <Loader2 className="spin" size={14} />
                Saving…
              </>
            ) : (
              <>
                <Check size={14} />
                Progress saved
              </>
            )}
          </span>
          <button
            className="button outline compact"
            onClick={leave}
            disabled={busy}
          >
            <Save size={15} />
            Save & leave
          </button>
        </div>
      </header>
      <div className="setup-layout">
        <aside className="setup-sidebar">
          <span className="eyebrow purple">A HOME FOR YOUR EXPERTISE</span>
          <h1>
            Make it
            <br />
            yours.
          </h1>
          <p>A few details, your first product, and your own style.</p>
          <ol>
            {steps.map((item, i) => (
              <li
                key={item.title}
                className={
                  i + 1 === step ? "current" : i + 1 < step ? "done" : ""
                }
              >
                <span>{i + 1 < step ? <Check size={15} /> : i + 1}</span>
                <div>
                  <b>{item.title}</b>
                  <small>{item.detail}</small>
                </div>
              </li>
            ))}
          </ol>
          <div className="setup-no-ai">
            <ShieldCheck size={17} />
            <p>
              No AI connection needed. You can do every step here, at your own
              pace.
            </p>
          </div>
        </aside>
        <main className="setup-main">
          <div className="setup-step-heading">
            <span className="eyebrow purple">STEP {step} OF 5</span>
            <h2>{current.title}</h2>
            <p>{current.detail}. Your progress stays with your account.</p>
          </div>
          {error && (
            <div role="alert" className="error-box">
              {error}
            </div>
          )}
          <fieldset disabled={busy} className="setup-fields">
            {step === 1 && (
              <>
                {stanImported ? (
                  <div className="notice">
                    <b>Your Stan details are in.</b>
                    <p>{stanImported}</p>
                  </div>
                ) : (
                  <div className="notice stan-callout">
                    <div>
                      <b>Moving from Stan?</b>
                      <p>
                        Bring your profile and a product over from your
                        stan.store page. You can edit everything after.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="button outline compact"
                      onClick={() => setStan(true)}
                    >
                      <Download size={15} />
                      Import from Stan
                    </button>
                  </div>
                )}
                <div className="form-row">
                  <label>
                    Your name
                    <input
                      required
                      maxLength={100}
                      value={content.creator.name}
                      onChange={(e) => updateCreator("name", e.target.value)}
                      placeholder="Your name or coaching business"
                    />
                  </label>
                  <label>
                    Store address
                    <div className="input-prefix">
                      <span>
                        <Wordmark /> /
                      </span>
                      <input
                        required
                        maxLength={40}
                        value={content.creator.slug}
                        onChange={(e) =>
                          updateCreator("slug", e.target.value.toLowerCase())
                        }
                        placeholder="your-name"
                      />
                    </div>
                  </label>
                </div>
                <div className="profile-upload">
                  <div className="avatar creator-avatar">
                    {content.creator.photo ? (
                      <img src={content.creator.photo} alt="Your profile" />
                    ) : (
                      content.creator.name.slice(0, 1) || "Y"
                    )}
                  </div>
                  {s ? (
                    <AssetUpload
                      purpose="image"
                      label="Upload profile photo"
                      onUploaded={(a) => updateCreator("photo", a.url)}
                    />
                  ) : (
                    <p>
                      Add a photo URL now, or upload one after your profile is
                      saved.
                    </p>
                  )}
                </div>
                <label>
                  Profile photo URL
                  <input
                    type="url"
                    placeholder="https://…"
                    value={
                      content.creator.photo.startsWith("/")
                        ? ""
                        : content.creator.photo
                    }
                    onChange={(e) => updateCreator("photo", e.target.value)}
                  />
                </label>
                <label>
                  Short bio
                  <textarea
                    rows={3}
                    maxLength={350}
                    value={content.creator.bio}
                    onChange={(e) => updateCreator("bio", e.target.value)}
                    placeholder="A short introduction in your own words."
                  />
                </label>
                <label>
                  Who do you help?
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={content.creator.audience}
                    onChange={(e) => updateCreator("audience", e.target.value)}
                    placeholder="Describe the people your work is made for."
                  />
                </label>
                <label>
                  What do you sell?
                  <input
                    maxLength={1000}
                    value={content.creator.whatTheySell}
                    onChange={(e) =>
                      updateCreator("whatTheySell", e.target.value)
                    }
                    placeholder="e.g. Workbooks and templates for independent consultants"
                  />
                </label>
                <label>
                  Support email
                  <input
                    required
                    type="email"
                    maxLength={254}
                    value={content.creator.supportEmail}
                    onChange={(e) =>
                      updateCreator("supportEmail", e.target.value)
                    }
                    placeholder="hello@yourbusiness.com"
                  />
                  <small>
                    Shown on your storefront so buyers can get help.
                  </small>
                </label>
              </>
            )}
            {step === 2 && (
              <>
                <div className="notice">
                  <b>Start with something you already made.</b>
                  <p>
                    Paste your existing copy and upload your assets. You can
                    refine the wording and add sections before publishing.
                  </p>
                </div>
                <label>
                  Product name
                  <input
                    required
                    maxLength={140}
                    value={content.product.title}
                    onChange={(e) => updateProduct({ title: e.target.value })}
                    placeholder="What is your resource called?"
                  />
                </label>
                <label>
                  Existing product description
                  <textarea
                    rows={6}
                    maxLength={5000}
                    value={content.product.description}
                    onChange={(e) =>
                      updateProduct({ description: e.target.value })
                    }
                    placeholder="Paste your product description here…"
                  />
                </label>
                <div className="setup-cover">
                  {content.product.image ? (
                    <img src={content.product.image} alt="Your product cover" />
                  ) : (
                    <>
                      <Package size={32} />
                      <span>Your work deserves a good cover.</span>
                    </>
                  )}
                </div>
                <AssetUpload
                  purpose="image"
                  label="Upload cover image"
                  onUploaded={(a) => updateProduct({ image: a.url })}
                />
                <label>
                  Or use an existing cover image URL
                  <input
                    type="url"
                    placeholder="https://…"
                    value={
                      content.product.image.startsWith("/")
                        ? ""
                        : content.product.image
                    }
                    onChange={(e) => updateProduct({ image: e.target.value })}
                  />
                </label>
                <div className="choice-grid">
                  <button
                    type="button"
                    className={!content.product.isPaid ? "chosen" : ""}
                    onClick={() => updateProduct({ isPaid: false, price: 0 })}
                  >
                    <DownloadIcon />
                    <b>A free resource</b>
                    <span>Collect a lead before delivery.</span>
                  </button>
                  <button
                    type="button"
                    className={content.product.isPaid ? "chosen" : ""}
                    onClick={() => updateProduct({ isPaid: true })}
                  >
                    <CreditCard size={20} />
                    <b>A paid product</b>
                    <span>Secure hosted checkout.</span>
                  </button>
                </div>
                {content.product.isPaid && (
                  <div className="form-row">
                    <label>
                      Price
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={content.product.price / 100 || ""}
                        onChange={(e) =>
                          updateProduct({
                            price: Math.round(Number(e.target.value) * 100),
                          })
                        }
                        placeholder="0.00"
                      />
                    </label>
                    <label>
                      Store currency
                      <select
                        value={content.creator.currency}
                        onChange={(e) =>
                          updateCreator("currency", e.target.value)
                        }
                      >
                        {["usd", "cad", "eur", "gbp", "aud"].map((c) => (
                          <option key={c} value={c}>
                            {c.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                <label>
                  Delivery
                  <select
                    value={content.product.deliveryType}
                    onChange={(e) =>
                      updateProduct({
                        deliveryType: e.target.value as "url" | "file",
                      })
                    }
                  >
                    <option value="url">External resource link</option>
                    <option value="file">Uploaded PDF or ZIP</option>
                  </select>
                </label>
                {content.product.deliveryType === "file" ? (
                  <div className="setup-deliverable">
                    <AssetUpload
                      purpose="deliverable"
                      label={
                        content.product.assetId
                          ? "Replace private deliverable"
                          : "Upload your PDF or ZIP"
                      }
                      onUploaded={(a) => updateProduct({ assetId: a.id })}
                    />
                    {content.product.assetId && (
                      <Badge tone="green">Private file uploaded</Badge>
                    )}
                    <p>
                      Paid files remain private. This is never used as a public
                      sample.
                    </p>
                  </div>
                ) : (
                  <label>
                    Private delivery URL
                    <input
                      type="url"
                      value={content.product.deliveryUrl}
                      onChange={(e) =>
                        updateProduct({ deliveryUrl: e.target.value })
                      }
                      placeholder="https://www.notion.so/…"
                    />
                    <small>
                      Released only through authorized access, not included in
                      public page data.
                    </small>
                  </label>
                )}
              </>
            )}
            {step === 3 && (
              <>
                <div className="style-presets">
                  {Object.entries(presets).map(([key, preset]) => (
                    <button
                      type="button"
                      className={
                        "style-option preset-" +
                        key +
                        (content.appearance === key ? " selected" : "")
                      }
                      key={key}
                      onClick={() =>
                        setContent((c) => ({
                          ...c,
                          appearance: key as SetupContent["appearance"],
                        }))
                      }
                    >
                      <div className="style-swatch">
                        <span className="style-swatch-avatar" />
                        <b>Your next chapter.</b>
                        <div />
                        <div />
                      </div>
                      <span>
                        <b>{preset.name}</b>
                        {content.appearance === key && <Check size={17} />}
                      </span>
                      <p>{preset.description}</p>
                    </button>
                  ))}
                </div>
                <div className="notice">
                  One thoughtful mobile-first layout. Presets change typography,
                  palette, spacing and card treatment. Your content stays yours.
                </div>
              </>
            )}
            {step === 4 && (
              <>
                <div className="review-toolbar">
                  <div className="segmented">
                    <button
                      type="button"
                      className={preview === "store" ? "active" : ""}
                      onClick={() => setPreview("store")}
                    >
                      Storefront
                    </button>
                    <button
                      type="button"
                      className={preview === "product" ? "active" : ""}
                      onClick={() => setPreview("product")}
                    >
                      Product page
                    </button>
                  </div>
                  <Badge>Private preview</Badge>
                </div>
                <div className="setup-review">
                  <div className="phone-preview">
                    <iframe
                      key={preview + (p?.version || 0)}
                      title="Your populated mobile preview"
                      src={
                        "/dashboard/preview" +
                        (preview === "product" && p ? "?product=" + p.id : "")
                      }
                    />
                  </div>
                  <div className="review-copy">
                    <span className="eyebrow purple">
                      YOUR REAL INPUTS, IN PLACE
                    </span>
                    <h3>{p?.title || "Your first product"}</h3>
                    <p>
                      {p?.description ||
                        "Your existing copy appears in the preview."}
                    </p>
                    <div className="actions">
                      <button
                        type="button"
                        className="button outline"
                        onClick={() => setEdit(true)}
                        disabled={!p}
                      >
                        Edit product & sections
                      </button>
                      <button
                        type="button"
                        className="subtle-link"
                        onClick={() => setStep(1)}
                      >
                        Edit profile
                      </button>
                    </div>
                    <div className="notice">
                      <ShieldCheck size={18} />
                      <p>
                        Only your signed-in account can see this preview. Your
                        store and draft product are not publicly listed.
                      </p>
                    </div>
                    <p className="fine-print">
                      Add audience, included items, previews, FAQs and real
                      testimonials through the product editor. Empty sections
                      stay hidden.
                    </p>
                  </div>
                </div>
              </>
            )}
            {step === 5 && (
              <>
                <div className="activation-summary">
                  <span className="icon-square lavender">
                    <Package />
                  </span>
                  <div>
                    <h3>{p?.title || "Your first resource"}</h3>
                    <p>
                      {p?.price ? money(p.price, s?.currency) : "Free resource"}{" "}
                      ·{" "}
                      {p?.deliveryType === "file"
                        ? "Private file"
                        : "Private resource link"}
                    </p>
                  </div>
                  <Badge tone={state.completed ? "green" : "purple"}>
                    {state.completed
                      ? "Published"
                      : paid && s?.paymentsReady
                        ? "Payment-ready"
                        : "Private preview"}
                  </Badge>
                </div>
                {state.mode === "development" && (
                  <div className="notice">
                    <b>Development workspace</b>
                    <p>
                      Local checkout and email are simulations. Publishing here
                      makes the resource available on this local app, not on the
                      public internet.
                    </p>
                  </div>
                )}
                <section className="activation-step">
                  <div>
                    <span className="task-check checked">
                      <Check size={13} />
                    </span>
                    <h3>Check the deliverable</h3>
                  </div>
                  <p>
                    Publication validates the configured link or the completed
                    private upload. Run the protected delivery rehearsal to
                    check the access page and file/link.
                  </p>
                  <button
                    type="button"
                    className="button outline"
                    onClick={rehearsal}
                    disabled={!p || busy}
                  >
                    Test purchase & protected delivery
                  </button>
                  {test && (
                    <div className="notice">
                      <p>{test.notice}</p>
                      <a
                        className="button outline compact"
                        href={test.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open test access page <ExternalLink size={14} />
                      </a>
                    </div>
                  )}
                </section>
                <section className="activation-step">
                  <div>
                    <span
                      className={
                        "task-check " +
                        (!paid || s?.paymentsReady ? "checked" : "")
                      }
                    >
                      {!paid || s?.paymentsReady ? <Check size={13} /> : null}
                    </span>
                    <h3>{paid ? "Activate payments" : "No payments needed"}</h3>
                  </div>
                  {paid ? (
                    <>
                      <p>
                        Paid products use your connected Stripe account. A real
                        sandbox payment must be tested separately from the
                        delivery rehearsal.
                      </p>
                      <div className="actions">
                        <button
                          type="button"
                          className="button outline"
                          onClick={connect}
                        >
                          <CreditCard size={16} />
                          {s?.stripeAccount
                            ? "Continue Stripe onboarding"
                            : "Connect Stripe"}
                        </button>
                        {s?.stripeAccount && (
                          <button
                            type="button"
                            className="button outline"
                            onClick={refreshPayments}
                          >
                            Refresh payment status
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <p>
                      This free resource can be published without connecting
                      Stripe. It collects a lead before delivering the resource.
                    </p>
                  )}
                </section>
                {state.completed && (
                  <div className="published-success">
                    <Check size={22} />
                    <h3>Your resource has a home.</h3>
                    <p>Share your storefront whenever you’re ready.</p>
                    <a
                      className="button primary"
                      href={"/" + s?.slug}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View your storefront <ExternalLink size={16} />
                    </a>
                    <Link href="/dashboard/products" className="button outline">
                      Back to products
                    </Link>
                  </div>
                )}
              </>
            )}
          </fieldset>
          <footer className="setup-step-footer">
            {step > 1 ? (
              <button
                className="button outline"
                onClick={() => setStep(step - 1)}
                disabled={busy}
              >
                Back
              </button>
            ) : (
              <span />
            )}
            {!state.completed || step !== 5 ? (
              <button className="button primary" onClick={next} disabled={busy}>
                {busy && <Loader2 className="spin" size={16} />}{" "}
                {step === 5
                  ? "Publish my storefront"
                  : step === 4
                    ? "Continue to activation"
                    : "Save & continue"}
              </button>
            ) : (
              <Link className="button primary" href="/dashboard">
                Open workspace
              </Link>
            )}
          </footer>
        </main>
      </div>
      {edit && p && (
        <ProductEditor
          draftOnly
          product={p}
          currency={s?.currency || "usd"}
          onClose={() => setEdit(false)}
          onSaved={async () => {
            setEdit(false);
            const refreshed = await api<Setup>("setup");
            accept(refreshed, false);
            if (refreshed.product) {
              const p = refreshed.product;
              setContent((c) => ({
                ...c,
                product: {
                  ...c.product,
                  title: p.title,
                  description: p.description,
                  image: p.image,
                  buttonLabel: p.buttonLabel,
                  isPaid: p.price > 0,
                  price: p.price,
                  deliveryType: p.deliveryType as "url" | "file",
                  deliveryUrl: p.deliveryUrl || "",
                  assetId: p.assetId,
                },
              }));
            }
          }}
        />
      )}
      {stan && (
        <StanImport
          onClose={() => setStan(false)}
          onPrefill={prefillFromStan}
        />
      )}
    </div>
  );
}
function DownloadIcon() {
  return <FileText size={20} />;
}
