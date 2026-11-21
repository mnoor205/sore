# Activation and deployment

Complete these steps in staging first. Isolated Cloudflare storage/queues have been provisioned and migrated through the connected plugin. All three staging Workers have been deployed; no real sale was performed and no external email sent. See [DEPLOYMENT.md](DEPLOYMENT.md) for URLs, deployment IDs and the connector-compatible asset packaging. Stripe tax setup was skipped at the user's request; collection remains disabled.

## 1. Cloudflare resources and environments

The top-level configurations are local development; their placeholder UUIDs are local-only. The connected account is `27478de5040614b0328a6976a52b57d1`. Each `env.staging` binds the following actual resources:

| Resource          | Name                         | ID                                   |
| ----------------- | ---------------------------- | ------------------------------------ |
| D1                | coachlane-staging            | ccf1fff4-4a18-4876-8b77-a7c284f32989 |
| Private R2        | coachlane-private-staging    | bucket name                          |
| OAuth KV          | coachlane-staging-oauth      | 3ebeb53038014259a26f9f8d205b1fa7     |
| Queue             | coachlane-email-staging      | 7100782177ab48938852cb678a1907dc     |
| Dead-letter Queue | coachlane-email-dead-staging | edba16e1e48d4c50a04e043146192253     |

Apply all eight migrations; `0007_branded_email_otp.sql` adds the branded-email challenge table and `0008_import_sources.sql` tracks products imported from Stan. See [BRANDED-EMAIL.md](BRANDED-EMAIL.md) for the current sender/binding configuration. No demo data was seeded. The R2 bucket has no public endpoint enabled. Staging HTTPS origins are configured for `coachlane.getsore.me` and `coachlane-mcp-staging.warda.workers.dev`. Hosted signing secrets are already installed; branded Cloudflare email OTP is configured; external commerce/fulfillment credentials remain pending. `APP_MODE=production` prevents development login/payment simulations on staging. Do not recreate these resources.

Each `env.production` still contains invalid resource/domain placeholders. Production resources are separate and unprovisioned.

For CLI management, authenticate pinned Wrangler with an account-owned token scoped to the necessary Workers, D1, R2, KV and Queues permissions. Plugin access does not automatically expose CLI credentials. For a later production launch, provision separate resources.

Representative commands, to run only after deployment/provisioning is authorized:

```sh
npx wrangler d1 create coachlane-production
npx wrangler r2 bucket create coachlane-private-production
npx wrangler kv namespace create OAUTH_KV
npx wrangler queues create coachlane-email-production
npx wrangler queues create coachlane-email-dead-production
```

Copy returned resource IDs unchanged into all three `env.production` configurations. App, MCP and email Workers must bind the same production D1 database. Set `APP_URL` and `MCP_URL` to their actual distinct HTTPS origins. Set the production `WORKER_SELF_REFERENCE` service to the app Worker name. Leave R2 public access disabled.

Apply **only migrations** to production:

```sh
npx wrangler d1 migrations apply DB --remote --env production --config wrangler.jsonc
```

The app is not a Sites/Vinext project. It is actual Next.js with OpenNext. `wrangler.jsonc` points to `.open-next/worker.js` and `.open-next/assets`. `nodejs_compat` and `global_fetch_strictly_public` are configured. Logs/traces are enabled with query-string redaction to keep access tokens and OAuth tickets out of request URLs in observability.

## 2. Creator authentication: Cloudflare email OTP

Staging Access OTP is configured at `https://coachlane.getsore.me`; no Clerk account, public auth key or build-time auth value is required. See [AUTH.md](AUTH.md) for resource IDs, the exact flow and security tests.

The Access application protects only `/auth/verify`, using the reusable verified-email OTP policy. Keep the public storefront, checkout, buyer access and webhook paths outside that Access gate. The app validates issuer/audience/signature/expiry before issuing a hashed, revocable D1 session. Keep `APP_MODE=production` hosted; development cookies cannot authenticate there. The app's workers.dev entry is disabled.

For a separate environment, create its own Access app/policy and set runtime `ACCESS_ISSUER`, `ACCESS_AUDIENCE` and the actual HTTPS `APP_URL`. Apply all six migrations. Preserve the app session/bridge/download secrets already installed on staging. Test real OTP receipt, creator isolation, logout and the MCP sign-in return path before launch. Local development continues through its labeled simulated session.

## 3. Runtime secrets

`.dev.vars.example` documents the runtime names. `scripts/setup-local.mjs` creates local random secrets only. Supply production secrets through the Cloudflare dashboard's secret fields or Wrangler's interactive/stdin secret commands. Do not put values in shell arguments, tracked config, logs or source.

- App: `SESSION_SECRET`, `DOWNLOAD_SECRET`, `OAUTH_BRIDGE_SECRET`, Cloudflare Access runtime issuer/audience, `STRIPE_SECRET_KEY`, both webhook secrets, optional platform price IDs, R2 S3 credentials.
- MCP Worker: the **same** `OAUTH_BRIDGE_SECRET` as the app. OAuth uses its private KV binding; it does not use Stripe keys or the app's development session secret.
- Email Worker: `EMAIL_API_KEY`, `EMAIL_FROM`.

Use independent random secrets of at least 32 characters. Rotate local and production values independently. `.env.local` and `.dev.vars` are ignored. Local runtime secret files are not automatically deployed.

Wrangler `secret put` deploys changes. When deployment is not yet authorized, stage secrets through the documented versions workflow rather than applying production secrets immediately.

## 4. Private R2 uploads and delivery

Uploads work without S3 credentials: when they're absent, the browser PUTs to `/api/upload` with a five-minute, owner-bound, size-locked ticket and the Worker streams the file into the private `FILES` binding (fine for the 25 MB default). Direct-to-R2 uploads are optional for larger files. For those, create S3-compatible R2 credentials restricted to the chosen bucket. Set `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` on the app Worker. Replace the origin in `r2-cors.json` with the exact app HTTPS origin and apply it:

```sh
npx wrangler r2 bucket cors set coachlane-private-production --file r2-cors.json
```

Creators receive a five-minute signed PUT to a tenant-owned **staging** key, with the exact content type and length signed. Completion checks owner, size, extension, MIME and signature (PDF/ZIP or PNG/JPEG/WebP). It copies the validated object to an immutable private key. Reusing the staging PUT cannot change an existing buyer's deliverable. A lifecycle rule should expire `staging/` objects after one day. Uncompleted reservations count toward storage; operator reconciliation is still needed.

Assets have separate `deliverable`, `sample` and `image` purposes. `/api/media/:id` never serves protected deliverables. Anonymous access requires an explicitly referenced asset on a published store/product; owner preview access is authenticated. A sample must be uploaded separately from a purchased file. Do not enable R2 public access for previews.

Orders snapshot the deliverable ID/URL and product details. Replacements allocate a new asset. Previous buyer versions stay private and available. Download URLs are signed **application URLs**, not public bucket URLs; they expire after 120 seconds and recheck order/refund state before streaming R2 or redirecting to a private external resource.

## 5. Stripe: creator payments

The connected Stripe plugin was already available. Its implementation planner was run against the provided sandbox and returned an accepted hosted-Checkout plan. No separate Stripe connection or plugin install is needed for that completed planning step.

Use a separate Stripe sandbox for staging. The supplied sandbox secret stays in an ignored local runtime file. The plugin verified access to the Sore sandbox (`livemode: false`). Direct SDK networking failed in this executor; the application's real Checkout/webhook integration remains unverified. No test charge was created.

Configure `STRIPE_SECRET_KEY` with a sandbox key first; prefer a restricted key with the permissions needed for Accounts v2, account links, Checkout, payments/refunds, customers, Billing and portal sessions. Before live activation, review exact restricted-key permissions and geography with Stripe.

The implemented seller setup uses:

- Accounts v2 merchant configuration requesting card payments.
- Full Stripe Dashboard access.
- `defaults.responsibilities.fees_collector = stripe` and `losses_collector = stripe`.
- Stripe-hosted account onboarding, not platform-collected KYC.
- Checkout **direct charges** using `stripeAccount: connectedAccountId`. The creator is merchant of record and manages product disputes/refunds.
- No wallet, payout engine, destination charge or transfer.

From **Settings → Connect Stripe**, complete hosted onboarding, then **Refresh status** to check merchant capability. Account reuse is idempotent. The onboarding refresh URL requires an authenticated creator before making a new account link.

Create a Connect webhook destination for connected-account events pointing to:

`https://APP_DOMAIN/api/webhooks/connect`

Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded` and supported account-status notifications. Set its signing secret as `STRIPE_CONNECT_WEBHOOK_SECRET`. Test the real Accounts v2 notification configuration for your account; the app also has an explicit live capability refresh, and should be monitored for updated requirements before launch.

Webhook processing retrieves the actual Checkout session on the creator account, checks payment status, tenant/account/session/currency/amount, and atomically confirms the order and activates its outbox. Duplicate events cannot duplicate an order or fulfillment row. Async pending/failed payments never unlock access. Fulfillment does not depend on the success page.

Product-specific coupon reservations are atomic and expire when verified Checkout expiry/failure arrives. Do not release reservations solely by the browser timer, because a delayed webhook may still represent a real payment. Monitor/reconcile webhook failures before enabling sales.

## 6. Stripe: platform fees, lifetime and subscriptions

The sandbox has no project founding price. Provisioning remains incomplete after tax setup was skipped. Do not invent an address, registration or tax classification. Keep `PLATFORM_TAX_ENABLED` unset/false. When the commercial setup is resumed, create platform Products and Prices independently of creator resources:

- One founding lifetime **Product** (no fixed Price). Checkout charges it with inline `price_data`, because the founding offer is a ladder: `LTD_PRICE_CENTS` (9900) plus `LTD_STEP_CENTS` (1000) for every `LTD_STEP_EVERY` (5) completed founding purchases — $99 for buyers 1–5, $109 for 6–10, and so on. Completed purchases are paid lifetime billing sessions on non-demo stores; refunds don't rewind the ladder. This is the same count the homepage quote uses.
- A recurring price only after choosing the commercial terms. No monthly amount is assumed.

Set `STRIPE_LTD_PRODUCT_ID`, `STRIPE_RECURRING_PRICE_ID` and configurable `LTD_LIMIT`. Each reservation stores the amount it was offered at (`billing_sessions.amount`, migration 0009); the billing webhook refuses to activate a lifetime grant unless Stripe's USD subtotal matches it. The founding cap counts active lifetime entitlements and unexpired pending reservations atomically.

Staging (2026-11-20): the Sore sandbox used by `STRIPE_SECRET_KEY` (`acct_1UdkH5LKVkTyYf4F`) has product `prod_VfOPDFsW1KGqds`, default portal configuration `bpc_1Ue3cSLKVkTyYf4F5G6J4IRW`, and billing/connect webhooks `we_1Ue3cSLKVkTyYf4FBNDQSKJn` / `we_1Ue3cSLKVkTyYf4FprXqM1De` on API version `2026-11-18.endive`. The key and both signing secrets are installed on `coachlane-staging`. Quotas are snapshotted at checkout and retained on activation; changing engineering defaults does not reduce existing lifetime grants.

Enable the Stripe hosted billing portal, invoice/payment-method updates and cancellation. The app's **Plan & billing → Manage billing** creates a portal session. Lifetime checkout requests a hosted invoice; Stripe Billing manages recurring invoices.

Create a separate **platform-account** webhook destination:

`https://APP_DOMAIN/api/webhooks/billing`

Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, and `charge.refunded`. Configure `STRIPE_BILLING_WEBHOOK_SECRET`. Connected-account events are rejected by the platform handler. Subscription updates retrieve Stripe's current state to avoid stale event ordering. Lifetime grants ignore subscription events. A delayed lifetime success event cannot revive a refunded matching entitlement.

The grace policy is seven days from the first failed subscription period. Repeated failures cannot extend it. New checkouts pause after expiry; existing access and exports remain available. Recurring invoice refunds do not cancel subscriptions automatically: cancel separately if intended. Fully refunded lifetime purchases revoke the matching entitlement.

## 7. Tax and fees

`PLATFORM_FEE_BPS` is the app's transaction fee in basis points, zero by default. Stripe processing fees are additional and charged by Stripe to creators. Fee disclosure is in creator settings; no universal processor rate is invented.

Creators handle product-sale tax obligations. Store-level automatic calculation is intentionally disabled in the UI; activate its D1 `tax_enabled` setting only through an operator-reviewed migration after verifying that connected account's tax category, business address and registrations. Platform billing tax is separately gated by `PLATFORM_TAX_ENABLED=true` after verifying platform registrations/settings. Neither flag means remittance is handled automatically. Consult jurisdiction-specific tax requirements before launch. Initial local currency/time zone defaults are USD/America/Chicago, configurable per store; seller country is collected during Stripe onboarding and has not been assumed as a legal business fact.

## 8. Transactional email, Queues and outbox

Hosted fulfillment uses Cloudflare Email Sending through the email Worker's native `FULFILLMENT_EMAIL` binding, restricted to `EMAIL_FROM` (`delivery@getsore.me` on staging, a bare address). If that binding is absent, the Resend adapter below is used instead. Real inbox delivery from `delivery@getsore.me` is not yet verified. Resend is the fallback provider adapter. No provider account has been created or emails sent. Before enabling it, verify the sending domain, SPF/DKIM and sender address and configure `EMAIL_API_KEY` and `EMAIL_FROM` on the email Worker.

Deploy the email Worker with its Queue consumer, dead-letter queue, shared D1 and five-minute cron. The scanner submits due durable outbox records. Each consumer atomically obtains a lease, checks current order access, records attempts and retries with bounded exponential backoff. Explicit resends increment a delivery generation so provider idempotency does not suppress the resend. Provider acceptance is recorded as **sent**; inbox receipt/bounces are not claimed. Resend's idempotency window is finite, so an ambiguous external acceptance retried after that window may still duplicate an email. No irreversible distributed email operation can be made exactly-once solely with a D1 transaction.

After eight attempts the durable row becomes failed; inspect it and explicitly resend after resolving the provider error. Monitor the DLQ. Never log payloads containing email addresses or access URLs. Use synthetic recipient data in sandbox tests until the sender and delivery behavior are verified.

## 9. Remote MCP and client testing

Deploy `workers/mcp.ts` using `wrangler.mcp.jsonc` with production D1, private OAuth KV, HTTPS `MCP_URL`, app URL, and the shared OAuth bridge secret. The actual endpoint is `MCP_URL + /mcp`. Its protected-resource metadata links to OAuth discovery; registration, consent, PKCE S256, audience and token validation are handled by the maintained Cloudflare provider. This is not a generic JSON API labeled MCP.

Read access uses `store:read`. Optional writes require the client to request `products:draft:write` and the creator to check a separate consent checkbox, initially unchecked. Both the provider-issued token and current D1 connection must carry write authorization. Existing read grants do not gain write access automatically; reconnect with the requested scope. Identity comes from authentication, never tool arguments. Revocation in **Connect your AI** immediately blocks access.

The creator authenticates through Cloudflare email OTP and a signed, short-lived browser-bound bridge. Consent displays client identity, verification status, redirect hostname and the limited draft permission. No MCP permission can publish, delete, refund, message buyers or alter live prices.

The four read tools remain `get_store_context`, paginated `list_products`, bounded `get_sales_summary` and `get_product_performance`. Two draft tools are added:

- `create_product_draft`: unique UUID `requestId`, structured `content`, optional published `sourceProductId` to create a separate revision. Returns draft ID, saved content, version and a private review URL.
- `update_product_draft`: new UUID `requestId`, `draftId`, `expectedVersion` and nonempty content patch. Only unpublished, owned drafts are writable. A stale version fails; review the latest draft before submitting new edits.

Supported content: title, description, audience, included items, FAQs and button text. Optional `suggestedPrice` is integer minor units in the store currency; dashboard confirmation is required. Retries reuse the same UUID/content; changed input needs a new UUID. Conflicting reuse fails. Changes record source, actor and version. Publishing a revision checks that the live product has not changed since drafting.

Creator text is untrusted data. The external AI client generates copy from supplied material; the server validates/saves it. Read tools retain read-only annotations; draft tools declare writes and retry idempotency. The server never generates testimonials, credentials, results or scarcity. SDK 1.32.2 negotiates protocol **2025-11-25**; no broader transport compatibility is claimed.

To test a client: add the deployed HTTPS endpoint, complete login/consent, invoke all six tools, verify read-only connections cannot write, retry a create, reject stale/cross-creator edits and review/publish in the dashboard. Test revocation. Record the client version/protocol/auth flow. **ChatGPT and Claude remain untested.** The catalog/aggregate-only context report remains available as a fallback.

Useful prompts before any sale:

> Use this workbook and audience description to draft my product page. Save it as a draft for me to review.

> Review my catalog for unclear descriptions and missing information. Separate observations from suggestions.

For analytics, request recorded results and sample limitations; never fill empty history with invented metrics.

## 10. Build and deploy after authorization

After all placeholders, keys, policies, business details and external sandbox tests are complete:

```sh
npm run verify
# Authorized deployment only:
XDG_CONFIG_HOME=/tmp/coachlane-config npx wrangler deploy --config wrangler.email.jsonc --env production
XDG_CONFIG_HOME=/tmp/coachlane-config npx wrangler deploy --config wrangler.mcp.jsonc --env production
XDG_CONFIG_HOME=/tmp/coachlane-config npx opennextjs-cloudflare deploy --env production
```

Cloudflare Access issuer/audience are runtime configuration; no public/build-time auth credential is required. Preserve D1/R2 backups across app rollbacks—rolling back code does not roll back data. Verify live domains, webhook signatures/retries, upload CORS, recovery email, checkout/async payments/refunds, queue delivery, billing portal and OAuth in staging before a live launch.

## Official references consulted

- [OpenNext supported Next.js versions](https://opennext.js.org/cloudflare) and [configuration](https://opennext.js.org/cloudflare/get-started).
- [Cloudflare Access OTP](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/) and [JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).
- [Stripe Connect SaaS setup](https://docs.stripe.com/connect/saas), [Accounts v2 configuration](https://docs.stripe.com/connect/accounts-v2/connected-account-configuration), [direct-charge fee behavior](https://docs.stripe.com/connect/direct-charges-fee-payer-behavior).
- [Stripe Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment), [Billing portal](https://docs.stripe.com/customer-management/integrate-customer-portal), [Stripe Tax](https://docs.stripe.com/tax).
- [Cloudflare R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) and [browser CORS](https://developers.cloudflare.com/r2/buckets/cors/).
- [Cloudflare maintained OAuth provider](https://github.com/cloudflare/workers-oauth-provider), [consent flow](https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/consent-page.md), [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).
