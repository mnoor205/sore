# Implementation report

Coachlane is a working development MVP on the existing Next.js + Cloudflare architecture. This revision preserves commerce and its tests while making saved setup, product presentation and private AI drafts the first experience. The three staging Workers are now deployed on Cloudflare; no real payments were taken and no external email sent. See [DEPLOYMENT.md](DEPLOYMENT.md). Demo identities/products are fictional.

## Revision and acceptance coverage

| Requirement                        | Implementation and verification                                                                                                                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete setup without MCP         | Five-step creator/product/preset/review/activation flow uses ordinary authenticated APIs. The built app test completes it without an AI client.                                                                                        |
| Leave and resume                   | Owner-scoped D1 progress, debounced autosave, Save & leave, and optimistic version checks. Tests reload saved content and reject stale progress.                                                                                       |
| Preview actual inputs              | Signed-in private storefront and direct product previews use saved fields/preset, including a mobile frame. Built HTML tests verify supplied inputs.                                                                                   |
| Keep drafts/files private          | Public routes deny unpublished stores/products. Preview requires the owner. Public projections omit delivery URLs/asset IDs and hidden section content. Deliverables cannot serve as samples.                                          |
| Purchase paid product and deliver  | Verified-webhook fulfillment, immutable snapshots, protected access and download tickets remain. Service tests mock Stripe; bundled-app tests exercise labeled development payments. A real sandbox charge/webhook remains unverified. |
| Free lead capture and delivery     | Lead-gated delivery and optional marketing opt-in remain. A built app test publishes without Stripe and requests the resource as a lead.                                                                                               |
| Authorized MCP draft create/update | Separate draft-write consent and token/connection checks. SDK tests cover create/update; the real OAuth provider roundtrip obtains approved write access and invokes a draft tool.                                                     |
| Retry-safe create                  | Creator-scoped UUID, content hash, deterministic draft ID and atomic saved response. Repeated/concurrent requests return one draft; conflicting reuse is rejected.                                                                     |
| Protect live content and identity  | Identity is derived from authentication. Cross-tenant writes/stale versions fail. Published products receive separate draft revisions; MCP cannot alter live content/prices.                                                           |
| Explicit dashboard publication     | Private review links open the editor. Suggested prices require confirmation. Publication validates delivery, paid-payment readiness and the revision's base version. Tests verify explicit publication and conflict rejection.         |

The guided setup provides paste/upload assistance, not an account scraper or importer. Delivery rehearsals are labeled simulations, excluded from contacts/orders/reporting, with no Stripe charge or external email. A real sandbox payment must be checked separately.

Product pages add audience, included items, preview images or a separate sample, FAQs and creator-supplied testimonials. Empty/hidden sections do not render; order is limited to the predefined set. Three presets alter typography, colors and cards. There is no arbitrary page builder, embedded chatbot, paid LLM dependency, fabricated proof or scarcity.

The initial dashboard emphasizes launch tasks and product editing. Reporting waits for a published product and recorded activity. Drafting/catalog prompts precede analytics prompts; no-sales reporting stays honest.

## Preserved commerce

- Editable creator identity, unique slug, support/socials/audience/goals, Cloudflare Access email OTP and visibly simulated local sessions.
- Private PDF/ZIP delivery, validated immutable uploads, buyer snapshots and refund-aware access. Image uploads check PNG/JPEG/WebP signatures; public samples have a separate asset purpose.
- Free lead capture, deduplication, consent, customer/order search and CSV exports.
- Connect Accounts v2 hosted onboarding/direct-charge Checkout, separate platform billing, portal adapter, signed webhook reconciliation, pending payment locks and refund revocation.
- Coupons with expiry/atomic limits; founding-cap reservations and retained lifetime quota snapshots.
- Durable outbox, Queue consumer/scanner, retry records and explicit resends. Development deliveries say **not sent**.
- Bounded aggregate reporting with explicit currencies/minor units, tax exclusion, separately dated refunds and sparse-data limitations.

## Verification

- Strict TypeScript, real Next.js/OpenNext build and Wrangler dry-run packaging. Verification never deploys.
- **42 service/runtime tests in workerd**, using isolated D1/R2/KV and mocked provider responses. Original 27 tests retained; 11 storefront/draft cases and four email-auth cases added.
- **Eight bundled Next.js Worker HTTP tests**, preserving the original four and adding onboarding/private preview/free publication, presentation/sample isolation and hosted authentication guards and an email-auth/tenant/MCP/logout journey. The full suite also passes against the embedded-assets deployment adapter.
- Maintained OAuth provider tested through registration, browser-bound consent, PKCE, authorized draft writing, expiry, audience and immediate revocation.
- Source/build/archive scans exclude local secrets, which remain in ignored files.
- The previous dependency audit found no high/critical runtime advisories. Three moderate OpenNext build-chain findings (`glob`/`minimatch`) remain; no unsupported overrides were introduced.

## Connected services and remaining activation

**Cloudflare:** the plugin provisioned isolated staging D1, private R2, OAuth KV, an email Queue and a dead-letter Queue. All six migrations were applied and verified remotely. Three `env.staging` configurations contain real resource IDs. All three Workers are deployed with actual workers.dev origins, fresh hosted signing secrets, a Queue consumer and the five-minute email cron. No demo records or public R2 endpoint were created. `APP_MODE=production` requires the Cloudflare OTP-backed app session; local development login is disabled. Production resources remain separate and unprovisioned.

**Stripe:** the plugin verified the Sore sandbox (`livemode: false`) and an accepted integration plan. No project founding price exists. The sandbox lacked a head-office address and active tax registrations; the user asked to skip setup. Both tax gates remain disabled, and no tax registration or unverified platform Product/Price was created. Seller KYC, real Checkout/webhooks/refunds, billing portal and platform pricing remain unverified. The executor's direct SDK network check failed; connector access alone does not prove the deployed integration works.

**Current authentication:** branded Cloudflare Workers + Email Sending OTP replaces Access delivery so emails can use `login@getsore.me` and custom HTML. Existing identity/session mappings are retained. See [BRANDED-EMAIL.md](BRANDED-EMAIL.md).

**Previous authentication (rollback):** Clerk has been replaced by Cloudflare Access email OTP, configured on `coachlane.getsore.me`. Only `/auth/verify` is Access-gated; the app verifies the assertion and creates revocable D1 sessions. Runtime and built-app tests cover the callback and creator boundaries. Cloudflare MCP verified a real creator-supplied OTP, onboarding access, session persistence, logout and old-cookie replay rejection. See [AUTH.md](AUTH.md) and [AUTH-TEST-REPORT.md](AUTH-TEST-REPORT.md).

**Uploads:** hosted direct R2 uploads require bucket-scoped S3 credentials and exact-origin CORS. The local upload/validation path is tested. Keep public R2 access disabled.

**Email:** the Resend adapter needs a verified sender/domain and API key. No provider account was provisioned. Inbox delivery/bounces are unverified; provider acceptance alone does not prove arrival.

**AI clients:** maintained SDK/OAuth tests pass locally; ChatGPT and Claude remain untested. SDK 1.32.2 negotiates protocol 2025-11-25. The fallback report contains catalog/aggregates only.

**Browser QA:** managed preview failed, and the desktop browser integration later failed with `Browser Use could not read requirements`. Cloudflare MCP Browser Rendering subsequently verified the live homepage, real email OTP and authenticated session/logout flow, privacy page and MCP protected-resource discovery. Email sign-in and OTP screens have no horizontal overflow at 390 pixels. Broader viewport/accessibility QA remains unverified.

## Bounded MVP limits

- No public launch or finalized legal identity, refund/license terms, retention policy or jurisdiction-specific tax setup. Policy pages disclose the prelaunch state.
- Creators handle product-sale taxes/disputes. Tax calculation is disabled; automatic remittance is not promised. Recipients can share downloaded files and external links.
- Configurable defaults: 50 products, 25 MB uploads, 500 MB storage; CSV exports cap at 10,000 records and lists at 200.
- Abandoned upload reservations need operator reconciliation. Cleanup must retain purchased versions; there is no cleanup UI.
- Coupon/lifetime reservations await verified payment/expiry/failure. Monitor missing webhooks rather than assuming a browser timeout means failure.
- Email leases/provider idempotency reduce duplicates, but ambiguous acceptance beyond provider retention may duplicate delivery. Exactly-once external email is not claimed.
- Invoice refunds do not automatically cancel subscriptions. Full lifetime refunds revoke the matching entitlement. Existing buyer access/exports survive a billing lapse.
- No courses, bookings, memberships, customer migration, arbitrary MCP database tools or MCP publishing/deletion/refunds/messaging/live-price edits were added.

See [SETUP.md](SETUP.md) for activation and [README.md](README.md) for local commands.
