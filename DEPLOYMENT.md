# Cloudflare deployment

- App: https://getsore.me
- MCP endpoint: https://mcp.getsore.me/mcp
- MCP resource discovery: https://mcp.getsore.me/.well-known/oauth-protected-resource/mcp
- Email Worker: `coachlane-email-staging`, with workers.dev disabled, a Queue consumer and five-minute cron.

## Landing page and internal UI release — November 20, 2026

The Sore landing page and creator interface have passed release validation and are prepared for deployment to the existing `coachlane-staging` app Worker at `getsore.me`. This release includes the responsive iPhone storefront examples, Claude-style strategy demonstration, rotating assistant block, backend lifetime-price display, selling walkthrough, and matching internal dashboard/setup/editor/sign-in styles.

All 62 tests pass, with TypeScript, the staging Next.js/OpenNext production build, staging Wrangler dry run, and 13 bundled-app tests against the deployment artifact. Internal UI checks cover 16 views at four widths plus filters, editor keyboard behavior, navigation, and setup selections. No migrations are required.

The pre-release app version is `38ab0ea0-eb1a-4f46-b0d8-98bf7966632a`. Remote signing/payment secrets will be preserved. The MCP Worker remains `b1537c3b-8715-4595-97e7-bf6746a7c975`, and the independently updated email Worker remains `3ed6e0fe-d767-40cd-8c98-65006b1dd592`; neither companion Worker is being replaced by this web UI release.

## Pitch-black responsive theme release — November 20, 2026

Deployed the Sore pitch-black theme and responsive layouts to `getsore.me`, plus the matching dark OAuth consent screen to `mcp.getsore.me`. The existing app/MCP resources, domains, and signing-secret bindings were preserved; no database migrations or commerce configuration changes were needed. The fulfillment Worker is unchanged.

Validation: the staging OpenNext build and both Worker dry runs passed, with all 12 bundled-app tests passing against the deployment bundle. The preceding full verification passed all 61 tests. Local Chrome checked 17 pages at 11 widths (320–2560px), editor dialogs, mobile navigation, long titles, and landscape viewports. Twenty live HTTP checks passed for Sore branding, black theme metadata, the served responsive CSS and JavaScript, canonical redirects, protected APIs, disabled demo login, and MCP discovery/authentication. No real OTP, payment, or fulfillment email was sent.

## Current domain deployment — November 20, 2026

The current working project replaces the previous fitness app on `getsore.me`. `www.getsore.me` and `coachlane.getsore.me` permanently redirect to the canonical apex, preserving paths and query strings. `mcp.getsore.me` now serves this project's separate authenticated MCP Worker. The old `sore` Worker has no custom domains; its code and data remain available for rollback.

The existing project resources and signing secrets were retained. Cloudflare resource names and the CLI environment remain `coachlane-*-staging` / `--env staging`; the unused production configuration still contains placeholders. Do not deploy the placeholder production environment.

| Worker | Current version ID |
| --- | --- |
| coachlane-staging | 137c7919-454c-4162-9eeb-ff3d09929c81 |
| coachlane-mcp-staging | b1537c3b-8715-4595-97e7-bf6746a7c975 |
| coachlane-email-staging | 9a97896d-c3e6-4a1a-b7c3-bc9425fd579d |

This release uses authenticated Wrangler deployment with native Workers Assets. Rebuild with `npm run build:worker -- --env staging`, then deploy with `npx wrangler deploy --env staging --autoconfig=false --upload-source-maps=false`. Deploy the companion configs with the same environment. The embedded-assets packaging described below records the previous connector-only deployment path.

Validation: TypeScript, all 49 service tests and 12 bundled-app tests, OpenNext build, three Worker dry runs, and remote migration status passed. Live HTTP checks cover public pages, referenced JavaScript/CSS, canonical redirects, private API access, disabled demo login, and MCP/OAuth discovery and authentication requirements. The Cloudflare API confirms domain assignments and preserved signing-secret bindings. No fresh OTP or commerce transaction was performed. Existing payment, upload-credential, and fulfillment-provider setup remains pending.

## Previous deployment history

Deployed to the existing connected account and isolated staging resources. All seven migrations were verified, with zero creator stores/orders seeded. Production resources were not created. No real charge or fulfillment email was sent. Both the previous Access flow and the current branded Email Sending OTP flow were verified using codes received and supplied by the creator. Both tax gates remain disabled.

| Worker                  | Deployment ID                    |
| ----------------------- | -------------------------------- |
| coachlane-staging       | 5ba32100bf9d498c8dc5c32ac3c83c65 |
| coachlane-mcp-staging   | 34300be2a2f44de6ad1ece96faf0ecca |
| coachlane-email-staging | f3337ae3193c48fabcea108313fe728c |

## Current behavior

The public homepage and policy page are live. Creator sign-in now uses branded Cloudflare Workers + Email Sending OTP from `login@getsore.me`; Clerk was removed. The custom domain is the sole public app entry, with workers.dev disabled. The previous Access callback remains gated for rollback; branded requests use `/auth/email`, preserving public commerce. See [BRANDED-EMAIL.md](BRANDED-EMAIL.md) for the current provider, template and challenge/session design.

Fresh hosted session/download/bridge secrets were generated and installed as Cloudflare secret bindings. The app and MCP share only the bridge secret. Local development secrets and the sandbox Stripe key were not deployed.

Still pending: Stripe sandbox key/Connect/webhooks/platform pricing, R2 direct-upload credentials/exact-origin CORS, verified fulfillment email sender/API key, real purchase/delivery and external AI-client testing. The email consumer/schedule is installed, but no fulfillment email provider is enabled. MCP discovery is live; authenticated client use requires completing email OTP and a creator profile.

## Deployment packaging

The Cloudflare connector supports multipart Worker uploads but does not let callers set the separate Assets upload JWT. This deployment therefore embeds only `.open-next/assets` public files in an ES module, served by `scripts/embedded-assets-worker.mjs`, which delegates application requests to the unchanged OpenNext Worker. Private paid files remain in R2 and are never included.

The uploaded app has three modules: `worker.js` (adapter), `app.js` (built OpenNext app) and `assets.js` (24 public assets). Its runtime metadata has no native ASSETS binding because the adapter supplies that interface. The ordinary Wrangler configuration retains native Cloudflare Assets for later authenticated CLI deployments; both packaging paths are covered by bundled-app tests. Do not copy a deliverables bucket into the assets module.

Recreate and verify these modules after building/bundling:

```sh
node scripts/prepare-embedded-assets.mjs
COACHLANE_APP_BUNDLE=artifacts/embedded/worker.js npm run test:app
```

Deploy these three modules together through the Worker multipart API, with the app's staging bindings, `main_module=worker.js`, and existing secret bindings retained. Alternatively use ordinary authenticated Wrangler/OpenNext deployment with native Assets. Never upload `.dev.vars`, `.env.local`, source maps, development sessions or demo fixtures.

Temporary deployment-transfer storage was deleted after upload. The active Workers retain their own required OAuth KV/D1/R2/Queue bindings.

## Verification

- Strict TypeScript, maintained service/runtime suite (49 tests), real Next.js/OpenNext build and staging dry-run bundles.
- Twelve bundled-app HTTP tests pass, including production-mode demo-login denial and accurate missing-auth UI. The same twelve pass against the embedded-assets adapter, including actual browser JavaScript asset delivery.
- Cloudflare MCP Browser Rendering verified the live homepage, email sign-in page, real OTP login, authenticated onboarding, refresh/second-tab persistence, logout and old-cookie replay rejection, privacy page and protected-resource metadata. D1 and Access logs independently confirmed successful authentication and session revocation. See [AUTH-TEST-REPORT.md](AUTH-TEST-REPORT.md).
- Cloudflare API confirmed all three deployed Workers, workers.dev settings, expected bindings, Queue consumer, cron and database migration ledger.
- The desktop browser integration failed with `Browser Use could not read requirements`. Cloudflare's browser API subsequently completed the authenticated checks and verified no horizontal overflow on email sign-in/OTP screens at 390 pixels. Broader visual/accessibility QA remains unverified.

The deployment is suitable for viewing the public app and completing integration setup. It is not yet an operational live-sales storefront.

The initial branded-email deployment `c2881098502f45d4ababcc90bdb9764c` used the sender-restricted `LOGIN_EMAIL` native binding. Hosted source/configuration and secrets were verified after deployment, and a test requested through the live mobile form was accepted for delivery. The creator-supplied branded code successfully opened onboarding. Refresh/second-tab persistence, identity continuity and logout/replay rejection passed; D1 confirmed no test sessions/challenges remained afterward. Temporary upload storage was removed.

Returning creator sessions now persist for 30 days, and home/sign-in/signup skip the login flow for valid sessions. See [PERSISTENT-SESSIONS.md](PERSISTENT-SESSIONS.md) for behavior and the 61 passing regression tests.

Session persistence is deployed as `9e1c7451e26a4e3eba7e423cd8d0bdb1`. Cloudflare Browser Rendering verified live guest home/sign-in/signup routes and browser JavaScript delivery; all three entry routes return private/no-store headers. Signing secret names, branded sender and disabled workers.dev/preview aliases were preserved. Authenticated overnight return and 30-day cookie behavior passed against the exact deployment bundle in workerd; no new real-user OTP or browser restart was performed for this release. Temporary transfer storage was deleted.

Default DIMIGO theme deployed as `5ba32100bf9d498c8dc5c32ac3c83c65`. Cloudflare Browser Rendering verified the desktop homepage and mobile sign-in; computed primary background matches the supplied pink/coral gradient and there is no horizontal overflow at 390px. All 61 tests pass. Temporary transfer storage was removed. See [THEME.md](THEME.md).
