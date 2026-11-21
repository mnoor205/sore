"use client";
import Link from "next/link";
import {
  Package,
  Plus,
  Eye,
  Copy,
  Check,
  Sparkles,
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
              ? "A little link. Your work, all together."
              : "Let’s turn what you know into a storefront."}
          </h2>
          <p>
            {published
              ? "Your storefront is ready for its first visitors. Keep refining the presentation, share your bio link, and let real activity tell the story."
              : "Start with a resource you already have. Add your copy, choose an appearance, check the delivery, and publish when it feels ready."}
          </p>
          <div className="actions">
            <Link className="button primary" href="/onboarding">
              {published
                ? "Review your storefront setup"
                : "Continue guided setup"}
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
        <div className="launch-art">
          <span>✳</span>
          <div>
            <Badge tone={published ? "green" : "purple"}>
              {published ? "Published storefront" : "Private working draft"}
            </Badge>
            <b>{store.name}</b>
            <p>{live.length + drafts.length} resources with a home</p>
          </div>
        </div>
      </section>
      <div className="launch-section-heading">
        <h2>Your products, taking shape</h2>
        <button className="button outline compact" onClick={() => onEdit(null)}>
          <Plus size={16} />
          Add an existing product
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
            Review the product page, check your protected deliverable, and
            confirm payments for paid products. Free resources don’t need a
            Stripe connection.
          </p>
          <Link href="/onboarding" className="subtle-link">
            Open activation checklist
          </Link>
        </section>
        <section className="panel">
          <Sparkles size={23} />
          <h3>A second pair of eyes, if you want one.</h3>
          <p>
            Use your own AI client to help draft your product page from existing
            material. Every change stays private until you review and publish.
          </p>
          <Link href="/dashboard/connect-ai" className="subtle-link">
            Explore draft assistance
          </Link>
        </section>
      </div>
      <p className="launch-metrics-note">
        Reporting will take its place here once the store has measured views,
        free signups or confirmed purchases. Delivery rehearsals never count as
        sales.
      </p>
    </div>
  );
}
