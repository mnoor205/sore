# Sore landing page — design and launch notes

This is the new responsive homepage implementation in the existing Next.js app. The live site has not been replaced by this design revision. `landing-preview.html` is a standalone, responsive design preview; desktop and mobile PNGs are provided alongside it.

## Confirmed content

- Storefronts, product editing, predefined presentation sections, protected resource access, aggregate reporting, and private draft tools exist in the application.
- The founder confirmed support for assistants that allow remote MCP connections and confirmed setup assistance. Copy uses that capability-based description rather than an unsupported list of branded integrations.
- Setup help covers the saved creator setup flow, adding products, and connecting an assistant. No automated migration, course hosting, memberships, scheduling, or email marketing are promised.
- The AI demonstrations are labeled illustrative. Jamie Lane, the products, conversations, 12/5 paid orders, and $443 reporting are example data, not customer results. The sources use real MCP tool names. Recommendations are framed as experiments, not forecasts.
- The lifetime entitlement preserves the quotas granted at purchase. It does not convert automatically to a subscription. A full lifetime purchase refund revokes the entitlement.

## Pricing behavior

The implemented homepage reads `COUNT(DISTINCT billing_sessions.session_id)` for paid lifetime sessions belonging to non-demo stores. Pending, failed, subscription, and demo sessions do not affect the quote. Paid sessions remain completed purchases after a refund; the price does not rewind.

The quote follows `99 + 10 × floor(completed / 5)` in USD. Remaining places in the current tier are `5 − (completed mod 5)`; the next tier is $10 higher. The quoted amount is read on the server on each page request. On database failure, the price and inventory become unavailable; the page never substitutes a fabricated zero count.

Examples are visibly labeled illustrative: buyers 1–5 at $99, 6–10 at $109, and 11–15 at $119. The standalone preview freezes an illustrative $99 / five remaining / $109 next state, rather than pretending it is a live counter. An integration test covers zero, four, five, and ten completed purchases and exclusions.

## Must be completed before purchases open

1. **Price enforcement:** Existing billing still validates a single configured Stripe price. Implement the stepped-price rule in checkout, reservation/concurrency handling, and webhook reconciliation before enabling purchase buttons. Decide whether the quoted price is locked for a checkout session and disclose that policy.
2. **Payments and delivery:** The deployment record still lists Stripe activation, direct-upload credentials, and fulfillment-email configuration as pending. The page distinguishes supported application flows from hosted services still being activated.
3. **Final purchase terms:** Confirm refund terms, applicable tax treatment, and the meaning/duration of lifetime access in the legal terms. The page describes the existing entitlement behavior without inventing a refund window or future-feature guarantee.
4. **Final quotas and fees:** The homepage reads the configured limits (currently 50 products, 500 MB storage, 25 MB per file). AI-assistant fees, Stripe fees, and applicable taxes are separate. Confirm these published limits and the currently configured 0% platform transaction fee before checkout opens.
5. **Support contact:** Setup help is confirmed. Publish its contact channel and response expectations; these remain explicitly unconfirmed in the FAQ.
6. **Connection shortcuts:** The page includes a working copy-URL action and generic connection guide. Client-specific guides and one-click shortcuts are planned. Do not imply universal installation deep links exist.

## Current design

The hero leads with selling digital downloads. AI is a feature, illustrated inside a recognizable Claude conversation. Three examples use Sore MCP data for promotion strategy, product-page priorities, and next-product validation. Sample measurements are 240 views / 12 orders / $348 for Business Reset, 250 views / 5 orders / $95 for Pricing Playbook, and 78 free requests for Clarity. The 5% and 2% conversion figures are descriptive examples, not forecasts. Only the three supported MCP reporting/catalog/context tools are illustrated.

The assistant carousel is a persistent four-face 3D block, without visible controls. It pauses on hover/focus and respects reduced motion. Quota tiles and repeated fine print are removed. Limits and separate fees remain available inside the FAQ. Demo labels remain, and checkout remains disabled with its activation state stated once.

Pricing urgency comes from verified purchases left before the next $10 increase. The five slots display the actual tier; there is no timer, fabricated activity, or decorative price ladder. Unavailable backend data produces an unavailable quote rather than an invented count.

## Validation

49 service tests and 13 bundled-app tests pass (62 total), with TypeScript, Next.js/OpenNext production build, and Wrangler dry-run packaging. Fresh preview checks at 320, 390, 768, and 1440px find no document overflow; all three phones remain within the viewport and all rendered images load. The cube has four persistent faces and its parent rotates; visible playback controls and quota tiles are absent. All strategy example selectors work. Desktop/mobile preview renders show no console errors. These changes are local and have not been deployed.

The selling walkthrough now sits before AI: add a product, share one bio link, and deliver the download. Open illustrations show a sample workbook upload, social-profile link, and customer download. Desktop uses three columns; mobile uses compact visual/text rows. The flow is illustrative and identifies pending checkout activation.
