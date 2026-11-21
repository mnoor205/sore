# Cloudflare Access email OTP verification

This report covers the previous Access-backed mode. The newer branded email implementation and its validation are documented in [BRANDED-EMAIL.md](BRANDED-EMAIL.md).

Verified on 2026-11-20 against https://coachlane.getsore.me using the connected Cloudflare MCP API and Cloudflare-hosted Browser Rendering. No authentication policies were weakened for testing.

## Passed on the deployed service

- Access application protects `/auth/verify`, permits only the configured `onetimepin` identity provider, and uses a reusable Allow policy requiring that provider.
- Issuer and canonical app URL match the deployed application. Signing secret bindings exist; no values were retrieved.
- App workers.dev and preview aliases are disabled.
- Homepage, privacy, signup and email sign-in remain publicly accessible.
- Email sign-in and the Cloudflare code-entry screen have no horizontal overflow at a 390-pixel mobile viewport.
- Login creates a Secure, HttpOnly, SameSite=Lax, host-only state cookie at `/`. No application session exists before email verification.
- Workspace/setup APIs reject unauthenticated requests with 401.
- Forged Access identity email/JWT headers do not authenticate an API caller.
- The hosted development-session endpoint rejects simulated login with 404.
- Downloads without valid authorization are rejected with 401.
- An external `next` URL still routes to the application's Access callback.
- POST signout returns the canonical Cloudflare logout URL; GET cannot sign out.
- MCP resource discovery returns 200; unauthenticated tool calls return 401 and an OAuth challenge.
- D1 has all six migrations, including the login-state and session tables.
- A code received by the creator was submitted successfully through the live Cloudflare form. Access accepted it and the app opened onboarding.
- The app session cookie is Secure, HttpOnly, SameSite=Lax, host-only and scoped to `/`. D1 recorded an eight-hour session; no cookie/token values were logged.
- Authenticated `/api/setup` returned 200 before and after page refresh and in a second browser tab.
- An invalid callback state was rejected without invalidating the existing authenticated session.
- Logout cleared the app cookie and revoked its D1 session. Replaying the copied old cookie returned 401.
- Following Cloudflare logout caused the next sign-in attempt to require email authentication again.
- D1 confirmed zero remaining sessions for the test identity after logout. The test browser was closed.

## Automated regression run

42 runtime/service tests and eight HTTP tests against the exact embedded OpenNext deployment adapter passed. These include RSA/JWKS assertion validation, rejected invalid/expired claims, single-use login state, replay rejection, session expiry and hashing, creator isolation, MCP return navigation and logout revocation. Existing onboarding, privacy, commerce and draft authorization tests remain passing.

## Result and remaining integrations

The real email OTP, authenticated onboarding access, session persistence and logout/replay checks passed through Cloudflare MCP. An earlier expired code was rejected by Cloudflare; a fresh code completed the flow. No application source or Access policy changes were required during this verification.

Paid checkout, real fulfillment email and external authenticated MCP-client use remain separate integration checks; the deployment still lacks the Stripe and fulfillment-provider configuration listed in DEPLOYMENT.md.
