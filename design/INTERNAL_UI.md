# Internal UI revision — November 20, 2026

The dashboard, product editor, guided setup, and sign-in now share the landing page's visual language: pitch black, self-hosted Geist, off-white text, deeper pink/coral primary buttons with white labels, generous spacing, and open sections separated by fine rules. Product grids and launch cards become rows with visible covers. Metrics, forms, integration prompts, and billing plans lose enclosing cards. Dialogs and input fields retain the boundaries needed for interaction.

Shared branding is implemented by `src/components/brand.tsx`; scoped creator-interface styles live in `src/app/internal.css`, imported after the existing global styles. Public storefront preset styling and the landing page remain separately scoped. Selected navigation and controls keep clear state indicators. Mobile fields use 16px text and primary controls retain 44px touch targets.

Dashboard descriptions and setup copy are shorter. The AI connection screen emphasizes decisions grounded in sales data. Endpoint permissions remain available in a disclosure; optional private draft permission still requires consent and cannot publish or change live prices. Existing forms, billing actions, payments, data exports, and authentication use the existing application handlers.

## Preview

`internal-preview.html` renders the actual React components against data read from a disposable local Miniflare worker seeded with the fictional catalog. The populated analytics example comes from an isolated development checkout, with no real payment or email. This preview can navigate screens, filter products, open editors, and change setup selections. Mutating live-service actions are blocked; setup changes stay in memory. Storefront iframes use an illustrative read-only preview.

`internal-review.html` presents desktop/mobile captures of Products, Home, Sales overview, AI connections, Guided setup, Sign in, and the product editor. Screenshots are in `internal/`.

## Validation

TypeScript, production Next.js/OpenNext build, Worker dry-run packaging, 49 service tests, and 13 built-app tests pass. Preview layout checks cover all 16 internal views at 320, 390, 820, and 1440 pixels (64 combinations), with no document overflow or broken rendered images. Recorded interaction checks cover product filtering/search, editor opening and retained values, keyboard focus trapping, Escape and focus restoration, mobile navigation, endpoint copy, permission disclosure, appearance selection, and setup navigation.

This revision is local and has not been deployed. Payment activation, stepped checkout pricing, and delivery activation remain separate launch work.
