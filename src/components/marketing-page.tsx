import Link from "next/link";
import Brand from "./brand";
import { Check, Link2, Download, FileText } from "lucide-react";
import type { FoundingOffer } from "@/lib/founding-offer";
import McpSetupGuide from "./mcp-setup-guide";
import MarketingDemo from "./marketing-demo";
import StorefrontPhones from "./storefront-phones";
import SellingWalkthrough from "./selling-walkthrough";
import AiCompatibility from "./ai-compatibility";
import FoundingPriceChange from "./founding-price-change";
function OfferLink({
  price,
  available,
}: {
  price: number | undefined;
  available: boolean;
}) {
  // /lifetime sends the buyer to the current price tier's Stripe Payment Link.
  return (
    <a
      className="sf-button sf-primary"
      href={available ? "/lifetime" : "#lifetime"}
    >
      {price === undefined
        ? "Explore lifetime access"
        : `Get lifetime access — $${price}`}
    </a>
  );
}
export default function MarketingPage({
  offer,
  mcpUrl,
}: {
  offer: FoundingOffer;
  mcpUrl: string;
}) {
  const q = offer.quote,
    price = q?.price,
    open = offer.checkoutAvailable;
  const faqs = [
    [
      "What can I sell?",
      "PDFs, templates, guides, workbooks, and other digital downloads. Free resources, too. Courses, memberships, bookings, and email marketing aren’t included.",
    ],
    [
      "Which AI assistants work with Sore?",
      "Assistants that support remote MCP connections. Add Sore, sign in, and approve access. Availability depends on your assistant and plan. Setup help is included.",
    ],
    [
      "Can my AI change my live store?",
      "No publishing or live-price changes. With separate permission, it can save private product drafts. You review and publish. Revoke access from your dashboard anytime.",
    ],
    [
      "What does lifetime access include?",
      "Your storefront, digital products, reporting, AI connection, and setup help. One payment; no automatic subscription. Future subscriptions are for new customers.",
    ],
    [
      "Any limits or separate costs?",
      `${offer.quotas.products} products, ${offer.quotas.storageMB} MB storage, ${offer.quotas.uploadMB} MB per file. AI plans, Stripe fees, and applicable taxes are separate. The platform transaction fee is currently 0%.`,
    ],
    [
      "Can you help me get set up?",
      "Yes — setting up your storefront, adding your products and files, and connecting your AI. Bring your existing copy and downloads.",
    ],
    [
      "What’s still being activated?",
      "Storefront payments, direct uploads, and delivery email are being activated. You can start setting up your store now.",
    ],
  ];
  return (
    <div className="sore-reference sf-page">
      <a href="#main" className="sf-skip">
        Skip to content
      </a>
      <header className="sf-header">
        <div className="sf-container sf-nav">
          <Brand className="sf-wordmark" />
          <nav aria-label="Main navigation">
            <a href="#storefront">Storefronts</a>
            <a href="#connect">Connect AI</a>
            <a href="#lifetime">Lifetime</a>
          </nav>
          <div>
            <Link href="/sign-in" className="sf-login">
              Log in
            </Link>
            <OfferLink price={price} available={open} />
          </div>
        </div>
      </header>
      <main id="main">
        <section className="sf-container sf-hero">
          <a className="sf-offer-note" href="#lifetime">
            Founding lifetime access{" "}
            <span>· {q ? `$${price} one time` : "pricing unavailable"}</span>
          </a>
          <h1>
            Turn what you know<span>into your next sale.</span>
          </h1>
          <p>
            Sell workbooks, templates, and downloads from one link in your bio.
          </p>
          <div className="sf-hero-actions">
            <OfferLink price={price} available={open} />
            <a className="sf-text-link" href="#storefront">
              See the storefronts
            </a>
          </div>
          <StorefrontPhones />
        </section>
        <div className="sf-container sf-essentials">
          <span>
            <Link2 size={18} /> One link in your bio
          </span>
          <span>
            <Download size={18} /> Protected downloads
          </span>
          <span>
            <FileText size={18} /> Product reporting
          </span>
        </div>
        <SellingWalkthrough />
        <section id="connect" className="sf-container sf-section sf-connect">
          <div className="sf-section-heading">
            <div>
              <span className="sf-eyebrow">
                YOUR ASSISTANT. YOUR ACTUAL STORE.
              </span>
              <h2>Built for the AI era.</h2>
            </div>
            <p>
              Your sales. Your next move.
              <br /> Strategy grounded in your store.
            </p>
          </div>
          <AiCompatibility />
          <MarketingDemo />
        </section>
        <section id="lifetime" className="sf-container sf-section sf-lifetime">
          <div className="sf-price-intro">
            <span className="sf-eyebrow">FOUNDING LIFETIME ACCESS</span>
            <h2>
              {q ? (
                <>
                  {q.remaining} more {q.remaining === 1 ? "buyer" : "buyers"}.
                  <br />
                  <span>
                    {q.nextPrice === null
                      ? "Then the founding offer closes."
                      : `Then it’s $${q.nextPrice}.`}
                  </span>
                </>
              ) : (
                <>
                  Pay once.
                  <br />
                  Keep building.
                </>
              )}
            </h2>
            <p>One payment. Lifetime access.</p>
            <ul className="sf-included">
              <li>
                <Check size={17} /> Your storefront + digital products
              </li>
              <li>
                <Check size={17} /> Sales insights + AI connection
              </li>
              <li>
                <Check size={17} /> Help getting set up
              </li>
            </ul>
          </div>
          <div
            className="sf-price-offer"
            data-current-price={q?.price}
            data-price-remaining={q?.remaining}
            data-next-price={q?.nextPrice}
            data-pricing-state={q ? "live-count" : "unavailable"}
          >
            <div className="sf-price">
              <strong>
                {price === undefined ? "Unavailable" : `$${price}`}
              </strong>
              <span>USD · one time</span>
            </div>
            <FoundingPriceChange quote={q} />
            {open && price !== undefined ? (
              <>
                <a className="sf-button sf-primary" href="/lifetime">
                  Get lifetime access — ${price}
                </a>
                <p className="sf-checkout-note">
                  Secure checkout by Stripe. Pay with the email you’ll sign in
                  with and lifetime access is added to your account.
                </p>
              </>
            ) : (
              <>
                <button className="sf-button sf-primary" disabled>
                  {price === undefined
                    ? "Lifetime pricing unavailable"
                    : `Get lifetime access — $${price}`}
                </button>
                <p className="sf-checkout-note">Checkout is not open yet.</p>
              </>
            )}
            <Link href="/sign-up" className="sf-text-link">
              Start setting up your store
            </Link>
          </div>
        </section>
        <section id="faq" className="sf-container sf-section sf-faq">
          <h2>A few useful details.</h2>
          <div className="sf-faq-list">
            {faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
            <McpSetupGuide url={mcpUrl} />
          </div>
        </section>
      </main>
      <footer className="sf-container sf-footer">
        <Brand className="sf-wordmark" />
        <span>For coaches. For creators. For your next product.</span>
        <div>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <a href="#connection-guide">Setup help</a>
        </div>
      </footer>
    </div>
  );
}
