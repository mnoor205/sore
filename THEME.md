# Default site theme

Sore uses dark mode by default on every app route and storefront preset, independent of the device color preference. The root document declares a dark color scheme and browser theme color so native controls and the initial page render match.

- Pitch-black page background (`#000000`), neutral cards (`#0a0a0a` / `#141414`), and gray borders (`#2a2a2a`).
- Neutral off-white primary text (`#ededed`) and readable gray secondary text (`#a1a1a1`).
- Pink/coral gradient accents on primary actions and the Sore wordmark icon.
- Dark forms, dialogs, previews, onboarding, order pages, and public product pages.
- Editorial and Botanical retain their typography and accent identities with dark surfaces.
- Matching Sore branding and dark styling in sign-in emails and the AI connection consent screen.

Existing deployment domains, Cloudflare resource names, session cookies, and storage identifiers retain their original names for compatibility. The theme is deployed at https://getsore.me; hosted resources were not renamed.

## Responsive layout

Fluid hero typography and gutters adapt to phone, tablet, desktop, and ultrawide widths. Grid children can shrink safely and long content wraps. Compact layouts stack forms and actions, keep data tables and tabs independently scrollable, and retain every editor section. Mobile controls have 44px touch targets and 16px form text to avoid automatic input zoom. Menus and dialogs scroll within the dynamic viewport, including short landscape screens.

Validation: all 61 service and bundled-app tests pass, along with TypeScript, the Next.js/OpenNext build, and Wrangler dry-run packaging. Local Chrome layout checks cover 17 pages at 11 widths (320–2560px), plus editor dialogs, mobile navigation, long titles, and short landscape screens.

Live release: app version `137c7919-454c-4162-9eeb-ff3d09929c81`, MCP version `b1537c3b-8715-4595-97e7-bf6746a7c975`. Twenty live HTTP checks passed for the public pages, assets, redirects, and authentication boundaries. See [DEPLOYMENT.md](DEPLOYMENT.md).

## Deployed internal UI revision — November 20, 2026

The internal workspace now matches the revised landing page with self-hosted Geist, the lowercase `sore.` wordmark, deeper gradient pill actions with white labels, flat metrics and settings sections, and product rows with visible covers. The change covers the dashboard, product editor, guided setup, and sign-in. Styles are scoped in `src/app/internal.css`; public storefront presets retain their existing presentation.

This revision is deployed at https://getsore.me as app version `16c74c26-9ceb-47ea-a58f-121ec16fef29`. The preceding release details above remain as history. All 62 tests and 37 live release checks pass. See `design/INTERNAL_UI.md` for validation and preview details.
