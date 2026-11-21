# Returning creator sessions

The previous branded-email release used an eight-hour session and always displayed the public homepage and sign-in form, even with a valid creator session. This made returning creators repeat the login flow.

New branded-email sessions persist for **30 days** from sign-in. The Secure, HttpOnly, SameSite=Lax, host-only cookie now has both Expires and Max-Age matching D1's expiry. Browser restarts retain the cookie when ordinary persistent cookies are enabled. Explicit logout still revokes the server session immediately; session-token hashes and creator identity mappings are unchanged.

The homepage, sign-in and signup pages validate the existing session on the server. Creators with a store go directly to the dashboard, and creators without one resume onboarding. A requested private dashboard or MCP bridge destination is retained only if allowed by the existing same-origin redirect validator. Expired, unknown and fabricated cookies render the normal public/login pages. These routes are dynamic and their authenticated redirects must not be publicly cached.

Existing valid sessions continue to work. The 30-day lifetime starts on the next successful email sign-in; previously expired sessions are not revived and legacy Access assertions retain their original limits. No schema migration, signing-secret rotation or mass session change is required.

Validation: strict TypeScript, full OpenNext build, staging deployment dry run, 49 service/runtime tests and 12 HTTP tests against the exact deployment adapter pass (61 total). The regression suite checks an overnight absence longer than the old eight-hour limit, returning creator redirects, saved setup, safe private return URLs, guest isolation, expired/fabricated sessions, persistent cookie expiry and logout revocation.

Deployed app version: `9e1c7451e26a4e3eba7e423cd8d0bdb1`. Live Cloudflare MCP checks verified guest entry routes, private/no-store response headers, JavaScript assets and preserved sender/secrets/alias settings. Authenticated overnight-return cases used isolated test sessions against the exact deployed bundle; this release did not request another real inbox code or restart a real user browser.
