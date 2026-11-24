"use client";
import { Wordmark } from "./brand";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "./shared";
export type Store = {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  bio: string;
  photo: string;
  accent: string;
  supportEmail: string;
  audience: string;
  goals: string;
  currency: string;
  timezone: string;
  socials: string;
  demo: number;
  publicationState: string;
  stylePreset: string;
  whatTheySell: string;
  linkCopiedAt: number | null;
  paymentsReady: number;
  stripeAccount: string | null;
};
export default function StoreForm({
  store,
  onSaved,
}: {
  store?: Store;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
      slug: store?.slug || "",
      name: store?.name || "",
      bio: store?.bio || "",
      photo: store?.photo || "",
      accent: store?.accent || "#ec008c",
      supportEmail: store?.supportEmail || "",
      audience: store?.audience || "",
      goals: store?.goals || "",
      whatTheySell: store?.whatTheySell || "",
      stylePreset: store?.stylePreset || "studio",
      currency: store?.currency || "usd",
      timezone: store?.timezone || "America/Chicago",
      socials: store ? JSON.parse(store.socials) : {},
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const change = (key: string, v: string) =>
    setF((old) => ({ ...old, [key]: v }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("store", f, store ? "PATCH" : "POST");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="store-form" onSubmit={save}>
      <div className="form-section">
        <h3>A first impression that feels like you</h3>
        <p>Your profile appears at the top of your public storefront.</p>
        <div className="form-row">
          <label>
            Display name
            <input
              required
              minLength={2}
              maxLength={100}
              value={f.name}
              placeholder="Your name or business"
              onChange={(e) => change("name", e.target.value)}
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
                minLength={3}
                maxLength={40}
                pattern="[a-z][a-z0-9-]*"
                value={f.slug}
                placeholder="your-name"
                onChange={(e) => change("slug", e.target.value.toLowerCase())}
              />
            </div>
          </label>
        </div>
        <label>
          Short bio
          <textarea
            rows={3}
            maxLength={350}
            placeholder="Who do you help, and how?"
            value={f.bio}
            onChange={(e) => change("bio", e.target.value)}
          />
          <small>{f.bio.length}/350 characters</small>
        </label>
        <div className="form-row">
          <label>
            Profile photo URL
            <input
              type="url"
              value={f.photo.startsWith("/") ? "" : f.photo}
              placeholder="https://…"
              onChange={(e) => change("photo", e.target.value)}
            />
          </label>
          <label>
            Accent color
            <div className="color-field">
              <input
                type="color"
                value={f.accent}
                onChange={(e) => change("accent", e.target.value)}
              />
              <span>{f.accent.toUpperCase()}</span>
            </div>
          </label>
        </div>
        <label>
          Support email
          <input
            required
            type="email"
            value={f.supportEmail}
            placeholder="hello@yourbusiness.com"
            onChange={(e) => change("supportEmail", e.target.value)}
          />
          <small>
            Published on your storefront so customers can reach you.
          </small>
        </label>
        <div className="form-row">
          <label>
            Website URL
            <input
              type="url"
              value={f.socials.website || ""}
              placeholder="https://…"
              onChange={(e) =>
                setF((o) => ({
                  ...o,
                  socials: {
                    ...o.socials,
                    website: e.target.value || undefined,
                  },
                }))
              }
            />
          </label>
          <label>
            Instagram URL
            <input
              type="url"
              value={f.socials.instagram || ""}
              placeholder="https://instagram.com/…"
              onChange={(e) =>
                setF((o) => ({
                  ...o,
                  socials: {
                    ...o.socials,
                    instagram: e.target.value || undefined,
                  },
                }))
              }
            />
          </label>
        </div>
      </div>
      <div className="form-section">
        <h3>Appearance preset</h3>
        <label>
          Style
          <select
            value={f.stylePreset}
            onChange={(e) => change("stylePreset", e.target.value)}
          >
            <option value="studio">Studio</option>
            <option value="editorial">Editorial</option>
            <option value="botanical">Botanical</option>
          </select>
        </label>
        <label>
          What you sell
          <input
            value={f.whatTheySell}
            maxLength={1000}
            onChange={(e) => change("whatTheySell", e.target.value)}
          />
        </label>
      </div>
      <div className="form-section">
        <h3>Your store’s defaults</h3>
        <p>
          Sales are reported in your store currency. Currency locks after the
          first order.
        </p>
        <div className="form-row">
          <label>
            Currency
            <select
              value={f.currency}
              onChange={(e) => change("currency", e.target.value)}
            >
              {["usd", "cad", "gbp", "eur", "aud"].map((c) => (
                <option value={c} key={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label>
            Time zone
            <input
              required
              value={f.timezone}
              onChange={(e) => change("timezone", e.target.value)}
            />
          </label>
        </div>
      </div>
      <div className="form-section">
        <h3>
          A little context goes a long way{" "}
          <span className="optional">Optional</span>
        </h3>
        <p>
          Help your connected AI understand your business. Keep customer
          information out of these fields.
        </p>
        <label>
          Your audience
          <textarea
            rows={2}
            value={f.audience}
            maxLength={1000}
            placeholder="e.g. Independent consultants building their first offer"
            onChange={(e) => change("audience", e.target.value)}
          />
        </label>
        <label>
          Your goals
          <textarea
            rows={2}
            value={f.goals}
            maxLength={1000}
            placeholder="What are you working toward?"
            onChange={(e) => change("goals", e.target.value)}
          />
        </label>
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <button className="button primary" disabled={busy}>
        {busy && <Loader2 className="spin" size={17} />}{" "}
        {store ? "Save storefront" : "Create my storefront"}
      </button>
    </form>
  );
}
