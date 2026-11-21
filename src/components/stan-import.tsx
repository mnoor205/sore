"use client";
import { useState } from "react";
import { Check, Download, Loader2 } from "lucide-react";
import { api, Badge, Modal, money } from "./shared";
import type { StanProduct, StanStore } from "@/lib/stan-import";

export type StanPreview = StanStore & { imported: string[] };
type Result = {
  created: { id: string; title: string; note: string }[];
  skipped: { title: string; reason: string }[];
  profileUpdated: boolean;
};

const typeLabels: Record<string, string> = {
  "digital-download": "Digital download",
  link: "External link",
  meeting: "Coaching call",
  course: "Course",
  membership: "Membership",
  webinar: "Webinar",
};
const typeLabel = (t: string) => typeLabels[t] || t.replace(/-/g, " ");

/**
 * Imports a stan.store storefront.
 * - Dashboard (default): bulk-imports chosen products as drafts into the existing store.
 * - Onboarding (`onPrefill`): fills the setup form with the profile and one chosen product.
 */
export default function StanImport({
  storeCurrency,
  onClose,
  onImported,
  onPrefill,
}: {
  storeCurrency?: string;
  onClose: () => void;
  onImported?: (r: Result) => void;
  onPrefill?: (store: StanPreview, product: StanProduct | null) => void;
}) {
  const [url, setUrl] = useState(""),
    [preview, setPreview] = useState<StanPreview | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [profile, setProfile] = useState(true),
    [result, setResult] = useState<Result | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const single = !!onPrefill;

  async function find(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const p = await api<StanPreview>("import/stan/preview", { url });
      setPreview(p);
      const available = p.products.filter(
        (x) => !p.imported.includes(x.sourceId),
      );
      setSelected(
        single
          ? available.slice(0, 1).map((x) => x.sourceId)
          : available.map((x) => x.sourceId),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function run() {
    if (!preview) return;
    if (onPrefill) {
      onPrefill(
        preview,
        preview.products.find((p) => p.sourceId === selected[0]) || null,
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await api<Result>("import/stan", {
        url: preview.handle,
        productIds: selected,
        profile,
      });
      setResult(r);
      onImported?.(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const toggle = (id: string) =>
    setSelected((s) =>
      single ? [id] : s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );

  return (
    <Modal title="Import from Stan" onClose={onClose} wide>
      <div className="editor-form stan-import">
        {error && (
          <div role="alert" className="error-box">
            {error}
          </div>
        )}
        {result ? (
          <>
            <div className="notice">
              <b>
                {result.created.length
                  ? `${result.created.length} product${result.created.length === 1 ? "" : "s"} imported as drafts.`
                  : "No new products were imported."}
              </b>
              <p>
                Nothing is live yet. Review each draft, add anything Stan
                couldn’t share, then publish.
                {result.profileUpdated &&
                  " Empty profile fields were filled from Stan."}
              </p>
            </div>
            <ul className="stan-results">
              {result.created.map((p) => (
                <li key={p.id}>
                  <Check size={16} />
                  <div>
                    <b>{p.title}</b>
                    {p.note && <small>{p.note}</small>}
                  </div>
                </li>
              ))}
              {result.skipped.map((p, i) => (
                <li key={"s" + i} className="skipped">
                  <span>–</span>
                  <div>
                    <b>{p.title}</b>
                    <small>{p.reason}</small>
                  </div>
                </li>
              ))}
            </ul>
            <footer className="modal-footer">
              <button className="button primary" onClick={onClose}>
                Review drafts
              </button>
            </footer>
          </>
        ) : !preview ? (
          <form onSubmit={find}>
            <p className="fine-print">
              We read your public Stan storefront: your name, bio, photo, social
              links and products. Nothing changes on Stan, and nothing here goes
              live until you publish it.
            </p>
            <label>
              Your Stan store link
              <input
                required
                autoFocus
                value={url}
                maxLength={300}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="stan.store/yourname"
              />
            </label>
            <footer className="modal-footer">
              <button
                type="button"
                className="button outline"
                onClick={onClose}
              >
                Cancel
              </button>
              <button className="button primary" disabled={busy || !url.trim()}>
                {busy ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <Download size={16} />
                )}
                Find my store
              </button>
            </footer>
          </form>
        ) : (
          <>
            <div className="stan-profile">
              <div className="avatar creator-avatar">
                {preview.photo ? (
                  <img src={preview.photo} alt="" />
                ) : (
                  preview.name.slice(0, 1)
                )}
              </div>
              <div>
                <b>{preview.name}</b>
                <small>stan.store/{preview.handle}</small>
                {preview.bio && <p>{preview.bio}</p>}
              </div>
            </div>
            {!preview.currencySupported && (
              <div className="notice">
                <b>Currency not supported</b>
                <p>
                  Your Stan prices use a currency Coachlane doesn’t support yet.
                  Prices are imported as numbers; check them before publishing.
                </p>
              </div>
            )}
            {storeCurrency &&
              preview.currencySupported &&
              preview.currency !== storeCurrency && (
                <div className="notice">
                  <b>Different currency</b>
                  <p>
                    Stan prices are in {preview.currency.toUpperCase()}, your
                    store uses {storeCurrency.toUpperCase()}. Amounts are
                    imported as-is; check them before publishing.
                  </p>
                </div>
              )}
            {preview.products.length ? (
              <fieldset className="stan-products" disabled={busy}>
                <legend>
                  {single
                    ? "Choose the product to start with"
                    : "Choose products to import"}
                </legend>
                {preview.products.map((p) => {
                  const done = preview.imported.includes(p.sourceId);
                  return (
                    <label
                      key={p.sourceId}
                      className={"stan-product" + (done ? " done" : "")}
                    >
                      <input
                        type={single ? "radio" : "checkbox"}
                        name="stan-product"
                        checked={selected.includes(p.sourceId)}
                        disabled={done}
                        onChange={() => toggle(p.sourceId)}
                      />
                      {p.image ? (
                        <img src={p.image} alt="" />
                      ) : (
                        <span className="stan-thumb" />
                      )}
                      <div>
                        <b>{p.title}</b>
                        <span className="stan-meta">
                          <Badge>{typeLabel(p.sourceType)}</Badge>
                          {p.price
                            ? money(p.price, storeCurrency || preview.currency)
                            : "Free"}
                          {done && <Badge tone="green">Already imported</Badge>}
                        </span>
                        {p.note && <small>{p.note}</small>}
                      </div>
                    </label>
                  );
                })}
              </fieldset>
            ) : (
              <p className="fine-print">
                We didn’t find any products on this Stan store.
              </p>
            )}
            {!single && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={profile}
                  onChange={(e) => setProfile(e.target.checked)}
                />
                <span>
                  Fill in my empty profile fields from Stan
                  <small>
                    Bio, photo and social links. Anything you’ve already written
                    stays as it is.
                  </small>
                </span>
              </label>
            )}
            <footer className="modal-footer">
              <button
                type="button"
                className="button outline"
                onClick={() => setPreview(null)}
                disabled={busy}
              >
                Back
              </button>
              <button
                className="button primary"
                onClick={run}
                disabled={busy || (!single && !selected.length && !profile)}
              >
                {busy && <Loader2 className="spin" size={16} />}
                {single
                  ? "Use these details"
                  : selected.length
                    ? `Import ${selected.length} as draft${selected.length === 1 ? "" : "s"}`
                    : "Import profile"}
              </button>
            </footer>
          </>
        )}
      </div>
    </Modal>
  );
}
