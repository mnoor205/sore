# Cloudflare email OTP authentication

**Current mode:** branded Cloudflare Workers + Email Sending OTP from `login@getsore.me`. See [BRANDED-EMAIL.md](BRANDED-EMAIL.md). The Access implementation below documents the previous mode and explicit rollback path.

Creator sign-in uses Cloudflare Access one-time PIN instead of Clerk. The application is hosted at **https://coachlane.getsore.me**. The existing `getsore.me`, `www.getsore.me` and `mcp.getsore.me` deployments belong to another app and were preserved.

## Resources

| Resource             | Value                                                            |
| -------------------- | ---------------------------------------------------------------- |
| Team issuer          | https://polished-butterfly-f3b5.cloudflareaccess.com             |
| OTP provider         | fc8e2e58-396d-4621-821e-27362c82f73c                             |
| Reusable policy      | 57c2c10a-8839-4543-81c9-9718ef310595                             |
| Access application   | 4bb2c86a-dec8-4722-b3cd-1212b855b333                             |
| App audience         | 7bd5f246386c0e56384f7bdd5a11f26397ce7d2eb70879b490a0016b14d0ccdc |
| Worker custom domain | 5187697f69a093f3a1cadf5acb91d780f11319d6                         |

The Access app protects only `coachlane.getsore.me/auth/verify`. Its reusable **Allow** policy includes everyone and requires the OTP identity provider; the app permits only that provider. This enables self-service signup after email verification. It is not an anonymous Bypass policy. Storefronts, free-resource capture, checkout, downloads, assets and webhooks remain public and enforce their existing application permissions. MCP keeps its separate OAuth permissions and consent.

Workers routing makes the custom hostname the app's public entry. The app's workers.dev route is disabled; the MCP Worker retains its own workers.dev URL. Do not add an unprotected app alias without reviewing the Access configuration.

## Login and session flow

1. `/sign-in` or `/sign-up` links to the configured HTTPS `/auth/start`. No public or build-time auth key is required.
2. The app creates a ten-minute browser-bound, signed login-state cookie and a hashed, single-use D1 nonce. Redirects and permitted return paths use trusted `APP_URL`; OpenNext's internal Node hostname is not a public origin.
3. `/auth/verify` is protected by Access. Cloudflare sends the email PIN and verifies it. No application SMTP/email-provider key is involved in OTP delivery.
4. On return, the app validates the signed `Cf-Access-Jwt-Assertion` using `jose` and the issuer's HTTPS JWKS. It checks RS256, issuer, application audience, expiration, issuance/not-before times, application token type, nonempty subject and verified email. An email header alone is never identity proof.
5. The browser-bound state is consumed atomically. The app creates an opaque `__Host-coachlane_session` cookie with Secure, HttpOnly, SameSite=Lax and Path=/; only its SHA-256 hash is stored in D1. Sessions last at most eight hours and never outlast the Access assertion. Expired sessions/nonces and rate-limit rows are cleaned during login.
6. Authenticated APIs load the session from D1 and derive the creator ID from issuer plus the normalized verified email. Re-adding an Access seat does not change store ownership. Changing the issuer requires an ownership migration. Profile/support-email edits do not change the login identity.
7. Logout deletes the current D1 session, clears app cookies and directs the browser to the application-domain Cloudflare logout endpoint. A copied old app cookie cannot be reused after logout. Other creators' sessions are unaffected.

Cloudflare administrator revocation and local app sessions are separate: revoke the corresponding D1 `creator_sessions` rows as well for immediate application-session removal. Otherwise the delegated session is bounded by its recorded expiry. Cloudflare Access organization limits and session policies still apply.

`0006_cloudflare_email_auth.sql` adds only login-state/session tables. Existing commerce, stores, saved setup and MCP grants are preserved. No hosted Clerk creators existed at migration, so no account mapping was needed. Explicit local development sessions remain available only in `APP_MODE=development`.

## Verification and recovery

- Runtime tests verify real RSA signatures with a fixture JWKS; forged, expired, premature, wrong-issuer/audience and service credentials fail.
- Browser-state mismatch, concurrent/repeated callback replay, session hashing/expiry and logout revocation are tested in workerd.
- Built-app tests exercise the actual login routes and cookies, two creators, private-product isolation, MCP auth bridge and logout. Existing commerce/onboarding tests are retained.
- Cloudflare MCP Browser Rendering completed a real email OTP using a code received and supplied by the creator. The live callback opened onboarding; authenticated setup access survived refresh and a second tab. Logout revoked the D1 session, and replaying the old cookie returned 401. Cloudflare required email authentication again afterward. See [AUTH-TEST-REPORT.md](AUTH-TEST-REPORT.md).

To test manually, open https://coachlane.getsore.me/sign-in, continue with email, enter the code Cloudflare sends, complete the creator profile, leave/resume and sign out. No password/recovery secret is needed. Cloudflare codes are single-use, expire after ten minutes, and requesting a new one invalidates the old code. Check spam/filtering for `noreply@notify.cloudflare.com` if needed.

Before rolling back code, preserve D1/R2. A rollback to the prior Clerk build leaves hosted creator login unavailable; it does not restore Clerk credentials. Restore matching auth code/config together and retain the Access app while active sessions exist.

References: [OTP setup](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/), [JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/), [application claims](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/), [session management/logout](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/).
