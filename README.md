# Sore

A working local MVP that helps independent business coaches turn existing products into a ready-to-sell storefront. Actual Next.js on Cloudflare Workers through OpenNext, with separate authenticated MCP and fulfillment Workers. MCP reads catalog/aggregates and, with separate consent, saves private drafts. No embedded chatbot or LLM subscription.

The app is deployed to [getsore.me](https://getsore.me), with branded creator email OTP powered by Cloudflare Workers, D1 and Email Sending from `login@getsore.me` (see [BRANDED-EMAIL.md](BRANDED-EMAIL.md)). Clerk has been removed. Storefront commerce remains public; private creator APIs require revocable app sessions. The legacy Access callback remains protected for rollback. Staging D1, private R2, OAuth KV, Queues and the scheduled email Worker are configured; all seven migrations are applied, including branded-email challenges. Stripe/webhooks, hosted upload credentials, fulfillment email and external AI-client verification remain pending. Tax collection stays disabled. See [AUTH.md](AUTH.md) and [DEPLOYMENT.md](DEPLOYMENT.md).

## Creator-first workflow

New creators start with five saved steps: creator/audience, existing product, appearance, populated private review, then delivery/payment activation and publication. Setup works without an AI client, resumes from D1, and includes a mobile preview of the actual storefront and product. Free resources can publish without Stripe. Paid publication in hosted mode requires a payment-ready seller account. A labeled delivery rehearsal exercises protected access without making a charge, sending email or adding reporting activity.

Product pages support optional audience, included items, preview images/separate sample, FAQs and creator-supplied testimonials. Creators can reorder or hide these predefined sections. Studio, Editorial and Botanical presets change the same mobile-first layout; there is no arbitrary page builder. Drafts are private, and purchased files are never automatically used as public samples.

**Storefront editor.** **My storefront** has two tabs. **AI editor** (default) is a chat where creators describe changes in plain language. Claude Haiku 5.5 runs through the Worker `AI` binding and Cloudflare AI Gateway, and writes a private, versioned draft (`storefront_drafts`) shown in a live preview. Nothing goes live until the creator publishes, and discarding leaves the live store untouched. On publish, only the fields the draft changed are applied, so manual edits made meanwhile survive. The AI can change profile copy, accent/preset, structured design options (`src/lib/storefront-theme.ts`), and product copy, order and sections. It cannot change prices, images, files, delivery, checkout or testimonials, and nothing is executed as HTML or CSS. **Manual editor** keeps the existing form, adds the same design options, saves straight to live, and previews unsaved edits without the AI draft. Both previews render the real storefront in an iPhone frame (default) or a scaled 1280px desktop viewport.

**Import from Stan.** Creators moving from stan.store can paste their Stan link on setup step 1 (prefills profile and a first product) or under **Products → Import from Stan** (bulk). The importer reads only the public storefront page, creates private drafts and never publishes. Images are copied into the creator's R2 storage so they survive cancelling Stan; empty profile fields are filled but nothing the creator wrote is overwritten; re-imports skip products already brought over. Stan doesn't expose purchased files or booking calendars, so downloads need their file uploaded and coaching calls need a booking link before publishing. See `src/lib/stan-import.ts`; parsing depends on Stan's current page structure and may need updating if Stan changes it.

The initial workspace emphasizes setup and products. Reporting appears after publication and recorded activity; empty states never invent performance data.

## Run locally

Use Node 24 and npm. From this directory:

```sh
npm ci
npm run setup:local
npm run build:worker
npm run dev
```

Open the local URL printed by Wrangler, normally `http://localhost:3000`. Choose **Sign in → Explore demo workspace**. The fictional Jamie Lane store has three sample PDFs in local private R2 and no invented sales, views, contacts or orders. **Create an empty store** starts a separate creator with no catalog or metrics. The demo flag never seeds new stores.

For a blank database without demo fixtures, run `node scripts/setup-local.mjs` instead. Local setup creates ignored random signing secrets, applies D1 migrations, and—with `--demo`—adds fictional fixtures and generated sample PDFs. Re-running it preserves your records. Do not apply `fixtures/demo.sql` remotely.

For normal development in Next's Node server, `npm run dev:next` is available, but release verification uses the built Workers runtime. The managed preview CLI is `sites-preview start /workspace/Sore` when that infrastructure is available.

Additional Workers, from separate terminals in the same directory:

```sh
XDG_CONFIG_HOME=/tmp/Sore-config npm run dev:mcp
XDG_CONFIG_HOME=/tmp/Sore-config npm run dev:email
```

All three configurations use the same local D1 database ID and persistence directory. The email worker dispatches the durable outbox every five minutes. In development it records **development: not sent** and never contacts an email provider. A creator can use **Orders → Resend access** to exercise this immediately. No actual email or charge is performed by the local demo.

## Verify

```sh
npm run verify
```

This type-checks, runs commerce/MCP services inside workerd with isolated D1/R2/KV and mocked external APIs, builds real Next.js with OpenNext, packages the actual application with Wrangler **dry run**, then tests HTTP routes of that built bundle in workerd. It does not deploy. `npm test` runs the service suite; `npm run test:app` requires the most recent `npm run build:worker && npm run bundle:check` output.

The 49 service/runtime tests and 13 bundled-app HTTP tests cover the existing commerce flows plus saved onboarding, private populated previews, free publication without payments, optional sections/sample isolation, explicit draft-write consent, retry-safe creates, version conflicts, tenant boundaries, price confirmation and dashboard-only publication of revisions. A real maintained OAuth-provider flow is tested through registration, browser-bound consent, PKCE exchange, an authorized draft write, audience checks and revocation. External APIs are mocked; this is not proof of live Stripe or ChatGPT/Claude compatibility.

## Architecture

- `src/app`: Next.js routes, creator dashboard, public `/{slug}` storefront, direct product and protected access pages. Forms and APIs have actual validation and error/empty states.
- `src/lib/catalog.ts`: tenant-scoped catalog and contact services. Plain text is escaped by React; no HTML or rich text execution.
- `src/lib/onboarding.ts`, `drafts.ts`, `presentation.ts`: resumable setup, audited/versioned draft writes, safe publication of revisions, and predefined presentation sections.
- `src/lib/payments.ts`, `billing.ts`, `webhooks.ts`: separate creator Connect charges and platform Billing. Verified webhooks reconcile payment state; the buyer's success page cannot confirm payment.
- `src/lib/reporting.ts`: the same bounded aggregate services power dashboard and MCP. Sales exclude tax; refunds retain their own dates and proportional product portions. Amounts are integer minor units with explicit currency.
- `src/lib/access.ts`, `uploads.ts`: tenant-owned private R2 objects, immutable completed upload keys, order snapshots, random hashed order capabilities and 120-second download tickets. Access is rechecked at download time, including after refunds.
- `src/lib/email.ts`, `workers/email.ts`: an atomic payment/outbox transition, leased retries, recorded attempts, Queue consumer and scheduled outbox scanner. Provider idempotency keys remain stable across retries and change on explicit resends.
- `src/lib/mcp.ts`, `workers/mcp.ts`: six SDK Streamable HTTP tools, maintained Cloudflare OAuth provider, a signed browser-bound creator-auth bridge, PKCE S256, resource audience, separate read/draft-write consent and D1 connection revocation. No buyer personal information or protected deliverables are exposed. MCP cannot publish, delete, refund, message customers or change live prices.
- `migrations/`: D1 schema. Drizzle's D1 adapter handles ordinary queries; D1 batches and conditional SQL handle atomic reservations and fulfillment transitions.

See [SETUP.md](SETUP.md) for exact activation and deployment steps and [IMPLEMENTATION.md](IMPLEMENTATION.md) for verification, assumptions and remaining limits.

## Defaults and policy

The app is named Sore. Engineering defaults are 50 products, 25 MB per upload, 500 MB storage and a seven-day failed-subscription-payment grace period. They are configurable, not researched requirements. A lifetime purchase snapshots its granted quotas so later defaults cannot reduce it. The founding offer starts at USD 99, has a configurable cap, and never converts automatically to a subscription. No recurring price is invented.

When a recurring plan lapses, new free and paid checkouts pause. Catalog management, exports and existing protected buyer access remain available. Cancel-at-period-end retains access through the paid period. A full lifetime-purchase refund revokes the lifetime entitlement. Refunding a recurring Stripe invoice does not itself cancel its subscription; subscription access follows Stripe's current subscription status. Product refunds are separate and a full refund revokes further protected resource access.

Creator product-sale taxes and disputes belong to the creator. Stripe sets and collects processing fees from the connected account. The platform transaction fee defaults to zero and is separately configurable. Tax calculation is off by default; this integration makes no promise of automatic tax remittance. Downloaded files and external links can be shared by recipients.

Returning creators are remembered for 30 days after sign-in, with server-validated redirects to their workspace or saved onboarding. See [PERSISTENT-SESSIONS.md](PERSISTENT-SESSIONS.md).
