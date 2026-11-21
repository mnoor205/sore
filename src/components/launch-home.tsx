"use client";
import Link from "next/link";
import {
  Package,
  Plus,
  Eye,
  Copy,
  Check,
  Link2,
  ShieldCheck,
} from "lucide-react";
import type { Store } from "./store-form";
import type { Product } from "./product-editor";
import { Badge, money } from "./shared";
export default function LaunchHome({
  store,
  products,
  onEdit,
  onCopy,
}: {
  store: Store;
  products: Product[];
  onEdit: (p: Product | null) => void;
  onCopy: () => void;
}) {
  const live = products.filter((p) => p.state === "published"),
    drafts = products.filter((p) => p.state === "draft"),
    published = store.publicationState === "published" && live.length > 0;
  return (
    <div className="launch-home">
      <section className="launch-hero">
        <div>
          <span className="eyebrow purple">YOUR EXPERTISE, READY TO SHARE</span>
          <h2>
            {published
              ? "Ready for your next sale."
              : "Let’s build your storefront."}
          </h2>
          <p>
            {published
              ? "Your products are live. Share your link and see what connects."
              : "Add a download, make the page yours, and share it when you’re ready."}
          </p>
          <div className="actions">
            <Link className="button primary" href="/onboarding">
              {published ? "Review setup" : "Continue setup"}
            </Link>
            <Link className="button outline" href="/dashboard/preview">
              <Eye size={16} />
              Private preview
            </Link>
            {published && (
              <button className="button outline" onClick={onCopy}>
                <Copy size={16} />
                Copy bio link
              </button>
            )}
          </div>
        </div>
        <div className="launch-store-preview">
          <div className="launch-preview-profile">
            <span>{store.name.slice(0, 1)}</span>
            <div>
              <strong>{store.name}</strong>
              <small>getsore.me/{store.slug}</small>
            </div>
          </div>
          <div className="launch-preview-covers">
            {products
              .filter((p) => p.state !== "archived")
              .slice(0, 3)
              .map((p) => (
                <div key={p.id}>
                  {p.image ? (
                    <img src={p.image} alt={p.title + " cover"} />
                  ) : (
                    <Package size={35} />
                  )}
                </div>
              ))}
          </div>
          <Badge tone={published ? "green" : "purple"}>
            {published ? "Published storefront" : "Private draft"}
          </Badge>
        </div>
      </section>
      <div className="launch-section-heading">
        <h2>Your products</h2>
        <button className="button outline compact" onClick={() => onEdit(null)}>
          <Plus size={16} />
          Add product
        </button>
      </div>
      <div className="launch-products">
        {products
          .filter((p) => p.state !== "archived")
          .slice(0, 4)
          .map((p) => (
            <button
              className="launch-product"
              key={p.id}
              onClick={() => onEdit(p)}
            >
              <div className="launch-product-image">
                {p.image ? (
                  <img src={p.image} alt={p.title + " cover"} />
                ) : (
                  <Package size={35} />
                )}
              </div>
              <div>
                <Badge tone={p.state === "published" ? "green" : "purple"}>
                  {p.revisionOf ? "Draft revision" : p.state}
                </Badge>
                <h3>{p.title}</h3>
                <p>
                  {p.description ||
                    "Add the words that help someone understand your resource."}
                </p>
                <b>{p.price ? money(p.price, store.currency) : "Free"}</b>
              </div>
            </button>
          ))}
        {!products.length && (
          <div className="launch-empty">
            <Package size={30} />
            <h3>Bring your first good idea.</h3>
            <p>
              A workbook, template, PDF or resource link you already have is a
              great place to begin.
            </p>
            <Link href="/onboarding" className="button primary">
              Add your first product
            </Link>
          </div>
        )}
      </div>
      <div className="launch-next-grid">
        <section className="panel">
          <ShieldCheck size={23} />
          <h3>Check the full experience</h3>
          <p>
            Preview your pages and test delivery before sharing. Free resources
            don’t need Stripe.
          </p>
          <Link href="/onboarding" className="subtle-link">
            Open activation checklist
          </Link>
        </section>
        <section className="panel">
          <Link2 size={23} />
          <h3>Make your next move with context.</h3>
          <p>
            Connect your sales data to your AI assistant. Decide what to
            promote, improve, or build next.
          </p>
          <Link href="/dashboard/connect-ai" className="subtle-link">
            Connect your AI
          </Link>
        </section>
      </div>
      <p className="launch-metrics-note">
        Sales and views appear here after recorded activity. Delivery tests
        don’t count as sales.
      </p>
    </div>
  );
}
