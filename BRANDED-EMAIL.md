# Branded sign-in email

Creator authentication uses Cloudflare Workers, D1 and Cloudflare Email Sending. The email comes from **Coachlane <login@getsore.me>**, with the same pink-to-coral palette, wordmark and rounded cards as the app. Both HTML and plain text are sent. A sample with a nonfunctional code is in [previews/login-email.html](previews/login-email.html).

Cloudflare Access's built-in one-time PIN provider exposes no custom sender or email-template setting. Its documented sender is `noreply@notify.cloudflare.com`; login-page branding does not change that email. Consequently, the branded mode moves email challenge delivery/verification into the existing app Worker. No third-party email provider, SMTP password or paid AI dependency was added.

## Runtime configuration

- `AUTH_PROVIDER=email` selects the branded mode.
- `OTP_FROM=login@getsore.me` supplies the sender.
- Native `LOGIN_EMAIL` (`send_email`) is restricted to that sender.
- The original `ACCESS_ISSUER` remains the immutable identity namespace. Creator IDs continue to hash the same normalized verified email with that namespace, preserving existing stores and sessions. Do not change it without an ownership migration.
- `ACCESS_AUDIENCE` and the legacy Access callback remain for explicit rollback support. In branded mode, `/auth/start` leads to the app sign-in form and the legacy `/auth/verify` rejects callbacks. The existing Access app protects only that unused legacy path; no Access policy was bypassed or weakened.
- The custom app domain and disabled workers.dev aliases are preserved.

The existing `getsore.me` Email Sending configuration is enabled and verified. Cloudflare reported ready DKIM, return-path SPF, bounce MX and DMARC records and an arbitrary-recipient quota of 1,000 messages/day. Existing incoming MX/SPF records were preserved. These provider limits can change independently of app limits.

## Challenge and session safety

`POST /auth/email` requires the exact configured Origin, JSON and a body of at most 4 KiB. The request action validates the email and creates a random six-digit code using Web Crypto with rejection sampling. Only a keyed HMAC of the challenge/code is stored in D1; plaintext codes are not returned to clients or logged. A signed, Secure, HttpOnly, SameSite=Lax host-only cookie binds the challenge and allowed return path to the requesting browser.

Codes expire after ten minutes and allow at most five guesses. Resending is limited to once per minute per email and invalidates its previous challenge. Sending is capped at five requests/minute/IP, 20/day/email and 100/day/IP; verification is capped at 20/minute/IP. Signup and existing-account login follow the same response flow. Delivery failure invalidates the challenge and returns a retryable error without issuing browser state.

Successful verification atomically consumes the challenge and creates one hashed opaque D1 session. Concurrent/replayed redemption cannot create another session. Sessions last 30 days, using a persistent cookie with Expires and Max-Age. Returning visits skip the login form after server-side session validation; see [PERSISTENT-SESSIONS.md](PERSISTENT-SESSIONS.md). Redirects use the configured app origin and predefined private paths. The existing authorization, MCP consent, protected delivery and logout revocation are retained. Logout also clears the challenge cookie.

## Validation

- Strict TypeScript, real Next.js/OpenNext build and staging Wrangler dry run passed.
- 49 runtime/service tests and 12 built-app HTTP tests passed (61 total), including the previous 50 regression tests.
- New tests cover sender/template content, code hashing, identity continuity, invalid/expired/browser-mismatched challenges, attempt limits, resend invalidation, concurrent redemption, failed sends, IP limits, CSRF/body limits and HTTP login/logout.
- Current app version: `5ba32100bf9d498c8dc5c32ac3c83c65`. Cloudflare API confirmed branded mode, the restricted native sender binding, preserved signing secret names and disabled public aliases.
- All seven D1 migrations are applied. The live mobile sign-in form accepted a request to the creator-provided test address and displayed the code-entry form. Native Email Sending usage confirmed one sent message; D1 confirmed a ten-minute challenge with only a 64-character keyed digest.
- Cloudflare Browser Rendering found no horizontal overflow in the email HTML or live sign-in form at 390 pixels. The challenge cookie is Secure, HttpOnly, SameSite=Lax and scoped to `/`.
- The creator received the branded email and supplied its code. Cloudflare MCP submitted it through the live form and the app opened onboarding. Authenticated setup returned 200 after refresh and in a second tab.
- The initial branded release verified a single eight-hour session in D1, exactly the same creator identity as the previous Access login, and no remaining code challenge. Logout cleared the cookie and revoked the session; restoring its copied cookie still returned 401. The next sign-in required email again.
- Final D1 checks confirmed zero remaining sessions/challenges for the test identity; the test browser was closed. The earlier Access OTP verification report describes the previous authentication mode. The recipient has not separately rated the email's visual rendering in their mail client.

Rollback requires restoring the previous app bundle and setting the previous Access-mode configuration together; retain the original issuer/audience, Access application, D1 and signing secrets. The additive seventh migration can remain in place.

References: [Access OTP](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/), [Email Sending Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/), [sender restrictions](https://developers.cloudflare.com/email-service/configuration/send-bindings/).
