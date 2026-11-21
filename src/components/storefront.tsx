"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FileText,
  ExternalLink,
  Instagram,
  Globe,
  ShieldCheck,
  Mail,
  Download,
  X,
  Loader2,
} from "lucide-react";
import ProductSections from "./product-sections";
import { api, Modal, money, Badge } from "./shared";
export type PublicStore = {
  name: string;
  slug: string;
  bio: string;
  photo: string;
  accent: string;
  currency: string;
  supportEmail: string;
  socials: Record<string, string>;
  demo: boolean;
  stylePreset?: string;
};
export type PublicProduct = {
  id: string;
  title: string;
  description: string;
  image: string;
  buttonLabel: string;
  price: number;
  kind: string;
  deliveryType: string;
  state: string;
  position: number;
  presentationJson?: string;
};
export default function Storefront({
  store: s,
  products,
  selectedId,
  preview = false,
  privatePreview = false,
}: {
  store: PublicStore;
  products: PublicProduct[];
  selectedId?: string;
  preview?: boolean;
  privatePreview?: boolean;
}) {
  const selected = products.find((p) => p.id === selectedId);
  const [choosing, setChoosing] = useState<PublicProduct | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (preview) return;
    try {
      let visitor = localStorage.getItem("coachlane_visitor");
      if (!visitor) {
        visitor = crypto.randomUUID();
        localStorage.setItem("coachlane_visitor", visitor);
      }
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries)
            if (entry.isIntersecting) {
              const productId = (entry.target as HTMLElement).dataset.product;
              api(`public/${s.slug}/view`, { productId, visitor }).catch(
                () => {},
              );
              observer.unobserve(entry.target);
            }
        },
        { threshold: 0.5 },
      );
      document
        .querySelectorAll("[data-product]")
        .forEach((el) => observer.observe(el));
      return () => observer.disconnect();
    } catch {}
  }, [preview, products, s.slug]);
  async function checkout(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const r = await api<{ url: string }>(`public/${s.slug}/checkout`, {
        productId: choosing!.id,
        name: form.get("name"),
        email: form.get("email"),
        marketing: form.get("marketing") === "on",
        code: form.get("code") || undefined,
      });
      window.location.href = r.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div
      className={
        "public-page preset-" +
        (s.stylePreset || "studio") +
        (selected ? " product-detail-page" : "")
      }
      style={{ "--store-accent": s.accent } as React.CSSProperties}
    >
      {s.demo && (
        <div className="demo-strip">
          Fictional demo storefront · development checkout · no real charges
        </div>
      )}
      {preview && (
        <div className="preview-strip">
          <EyeIcon />
          Private creator preview · not a live checkout · views excluded
        </div>
      )}
      <main className="store-container">
        <header className="creator-profile">
          {s.photo ? (
            <img className="creator-photo" src={s.photo} alt={s.name} />
          ) : (
            <div className="avatar creator-avatar">
              {s.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </div>
          )}
          <h1>{s.name}</h1>
          <p>
            {s.bio ||
              "A little space for what I know. Resources, ideas, and tools for your next chapter."}
          </p>
          <div className="social-links">
            {Object.entries(s.socials)
              .filter(([, url]) => url)
              .map(([name, url]) => (
                <a
                  key={name}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={name}
                >
                  {name === "instagram" ? (
                    <Instagram size={19} />
                  ) : (
                    <Globe size={19} />
                  )}
                </a>
              ))}
            {s.supportEmail && (
              <a href={"mailto:" + s.supportEmail} aria-label="Email creator">
                <Mail size={19} />
              </a>
            )}
          </div>
        </header>
        <div className="public-section-label">
          <span>MADE WITH YOU IN MIND</span>
          <span className="little-spark">✳</span>
        </div>
        {selected && (
          <a
            className="back-to-store"
            href={privatePreview ? "/dashboard/preview" : `/${s.slug}`}
          >
            All resources from {s.name}
          </a>
        )}
        <section className="public-products">
          {products.length ? (
            products.map((p) => (
              <article
                className={
                  "public-product " + (p.kind === "link" ? "public-link" : "")
                }
                key={p.id}
                data-product={p.id}
              >
                {p.kind === "link" ? (
                  <a
                    href={`/api/public/${s.slug}/link?product=${p.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="link-tile-icon">
                      <ExternalLink size={23} />
                    </span>
                    <span>
                      <h2>{p.title}</h2>
                      <p>{p.description}</p>
                    </span>
                    <ExternalLink size={17} />
                  </a>
                ) : (
                  <>
                    <Link
                      href={
                        privatePreview
                          ? `/dashboard/preview?product=${p.id}`
                          : `/${s.slug}/p/${p.id}${preview ? "?preview=1" : ""}`
                      }
                      className="public-cover"
                    >
                      {p.image ? (
                        <img src={p.image} alt={p.title + " preview"} />
                      ) : (
                        <div className="cover-fallback">
                          <FileText size={45} />
                          {p.title}
                        </div>
                      )}
                    </Link>
                    <div className="public-product-copy">
                      <div className="product-type-label">
                        {p.deliveryType === "file" ? (
                          <FileText size={13} />
                        ) : (
                          <ExternalLink size={13} />
                        )}{" "}
                        {p.price
                          ? "A RESOURCE FOR YOUR NEXT CHAPTER"
                          : "A LITTLE SOMETHING TO GET STARTED"}
                      </div>
                      <h2>{p.title}</h2>
                      <p>{p.description}</p>
                      <button
                        className="store-buy-button"
                        onClick={() => {
                          if (preview) {
                            api<{ url: string }>("setup/rehearse", {
                              productId: p.id,
                            })
                              .then((r) =>
                                window.open(
                                  r.url,
                                  "_blank",
                                  "noopener,noreferrer",
                                ),
                              )
                              .catch((e) => setError(e.message));
                            return;
                          }
                          setChoosing(p);
                          setError("");
                        }}
                      >
                        {preview ? "Test protected delivery" : p.buttonLabel}
                        <span>
                          {p.price ? money(p.price, s.currency) : "Free"}
                        </span>
                      </button>
                    </div>
                  </>
                )}
                {selectedId === p.id && (
                  <ProductSections value={p.presentationJson} />
                )}
              </article>
            ))
          ) : (
            <div className="public-empty">
              <span>✳</span>
              <h2>Good things take a little space.</h2>
              <p>
                New resources will appear here soon.
                <br />
                Come back for a fresh idea.
              </p>
            </div>
          )}
        </section>
        {error && !choosing && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        <footer className="store-footer">
          <p>Resources for your independent mind.</p>
          <div>
            <Link href={`/privacy?store=${s.slug}`}>Privacy</Link>
            <span>·</span>
            <Link href={`/terms?store=${s.slug}`}>Terms</Link>
            {s.supportEmail && (
              <>
                <span>·</span>
                <a href={"mailto:" + s.supportEmail}>Contact</a>
              </>
            )}
          </div>
          <Link className="powered-by" href="/">
            made with <b>Sore.</b>
          </Link>
        </footer>
      </main>
      {choosing && (
        <Modal
          title={
            choosing.price
              ? "Make it yours."
              : "A little clarity, coming your way."
          }
          onClose={() => {
            setChoosing(null);
            if (selectedId) window.history.replaceState(null, "", `/${s.slug}`);
          }}
        >
          <form className="buyer-form" onSubmit={checkout}>
            <div className="checkout-product">
              <div className="product-thumb">
                {choosing.image ? (
                  <img src={choosing.image} alt="" />
                ) : (
                  <FileText />
                )}
              </div>
              <div>
                <b>{choosing.title}</b>
                <small>
                  {choosing.price
                    ? money(choosing.price, s.currency) +
                      " · " +
                      s.currency.toUpperCase()
                    : "Free resource"}
                </small>
              </div>
            </div>
            <p>Enter your details to receive your private access link.</p>
            <label>
              Your name
              <input
                name="name"
                required
                autoComplete="name"
                maxLength={100}
                placeholder="First and last name"
              />
            </label>
            <label>
              Email address
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                maxLength={254}
                placeholder="you@example.com"
              />
            </label>
            {choosing.price > 0 && (
              <label>
                Discount code <span className="optional">Optional</span>
                <input name="code" maxLength={40} placeholder="Have a code?" />
              </label>
            )}
            <label className="checkbox-label">
              <input name="marketing" type="checkbox" />
              <span>
                I’d also like marketing updates from {s.name}.
                <small>
                  Optional. You can receive this resource without opting in.
                </small>
              </span>
            </label>
            {error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
            <button className="button store-primary wide" disabled={busy}>
              {busy ? <Loader2 className="spin" size={18} /> : null}
              {choosing.price ? "Continue to checkout" : "Send me the resource"}
            </button>
            <div className="buyer-security">
              <ShieldCheck size={15} />
              {choosing.price
                ? "Secure hosted checkout · tax shown at checkout"
                : "No payment needed · no buyer account required"}
            </div>
            {s.demo && (
              <p className="notice">
                Demo mode: checkout and email delivery are simulated.
              </p>
            )}
            <p className="fine-print">
              By continuing, you accept the{" "}
              <Link href="/terms">resource terms</Link> and{" "}
              <Link href="/privacy">privacy notice</Link>. External links and
              downloaded files can be shared by recipients.
            </p>
          </form>
        </Modal>
      )}
    </div>
  );
}
function EyeIcon() {
  return <span aria-hidden="true">◉</span>;
}
