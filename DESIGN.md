# Sore landing page — LocalSEO.to reference

Source: https://localseo.to/ . Inspected directly in the browser on November 20, 2026 at 1280×800 and 390×844. Evidence includes rendered desktop hero, problem section, pricing card, mobile hero, computed typography, CSS variables, DOM section positions, and font-face rules. The reference was inspected through the shared browser, taking precedence over the extraction skill's Firecrawl workflow.

## Extracted visual system

- Geist Variable, weight 100–900; the reference uses 600 for primary headings. Its Latin font is self-hosted in Sore with the SIL Open Font License in `public/fonts/OFL.txt`.
- Desktop heading: 60px, 63px line height, −3px tracking; mobile heading: 41.6px / 43.68px. Section headings: 36px / 40px, weight 600, −0.9px tracking.
- Computed reference tokens: background `oklch(15.5% 0 0)`, foreground `oklch(97% 0 0)`, muted text `oklch(70% 0 0)`, border `oklch(100% 0 0 / .09)`, base radius `.625rem`.
- Centered 1152px outer container with 24px inner gutters at desktop. Sticky header is 65px including its border. Hero copy is 768px wide with a 672px supporting paragraph and summary panel.
- Hero sequence: current-price badge, centered two-line heading, supporting copy, compact comparison/summary panel, purchase CTA, small terms line, secondary link, large product demonstration.
- Lower page: three-column facts band; split problem section; centered explanation; alternating two-column product feature rows; three-step setup; permission/security section; two-column lifetime pricing card; centered accordion FAQ; final price CTA; restrained footer.
- Pricing uses a five-slot availability indicator and an ascending tier chart. The mobile header collapses links into a menu; content and feature rows stack.
- No hero photograph or raster image inventory was found; the reference's product demonstrations are rendered interface components.

## Sore adaptations

The structural and typography choices above are carried into the existing Next.js homepage. Sore keeps its black canvas and restores its original `linear-gradient(to right, #ec008c, #fc6767)` on buttons, logo, selected pricing tier, and hero accent. Section spacing follows the reference rhythm; it is an adapted implementation rather than an assertion of pixel-identical output.

The reference's competitor-cost claims, refund window, countdown, and customer purchase numbers are not Sore facts and are not copied. Sore uses its existing backend purchase-count quote, existing quotas, confirmed MCP/setup scope, and explicit checkout-activation state. Product demos use the app's actual sample catalog and are visibly illustrative. Interactive tabs expose storefront, reporting, AI context, and a private draft, without modifying a real store.

Font asset observed: https://localseo.to/assets/geist-latin-wght-normal-BgDaEnEv.woff2 . License: https://github.com/vercel/geist-font/blob/main/OFL.txt . Existing Sore sample covers remain under `public/art/`.

## Current revision

The storefront leads: “Turn what you know into your next sale.” AI is a supporting feature. The desktop three-iPhone composition scales proportionally on mobile. Storefronts use peach, lilac, and mint palettes, and deeper gradients carry white button labels. Open sections and dividers replace marketing cards.

The AI illustration now explicitly depicts Claude: Claude wordmark, familiar sidebar/history, serif answers, clay-colored logo, and a bottom composer. Sore appears as a connected tool source, not the chat application. Workflows compare measured visits, orders, sales, and free requests to choose a promotion, improve a weak product page, or validate the next paid product. All demo data is illustrative; recommendations suggest tests rather than guaranteed revenue. Visual reference: https://academy.claude.com/tutorials/navigating-the-claude-desktop-app .

The assistant strip uses one persistent four-sided 3D object with a rotating parent and positioned faces. There are no visible playback or arrow controls. Rotation stops for reduced motion and pauses on hover/focus.

Pricing emphasizes the current backend price, purchases remaining, and next price. Five slots represent the current tier; the decorative staircase is removed. No countdowns or fabricated purchase activity. Quotas and material billing terms remain in the collapsed FAQ. Repeated disclaimers and AI-section fine print are removed; illustrative labels and the checkout activation state remain.

The selling walkthrough now sits before AI: add a product, share one bio link, and deliver the download. Open illustrations show a sample workbook upload, social-profile link, and customer download. Desktop uses three columns; mobile uses compact visual/text rows. The flow is illustrative and identifies pending checkout activation.
