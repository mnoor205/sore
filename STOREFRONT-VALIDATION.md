# Custom storefront validation — November 22, 2026

Local implementation and verification only. Existing uncommitted changes were preserved. No commit, push, merge, deployment or remote migration was performed. `npm run verify` includes Wrangler's **dry-run** bundling step, not a deployment.

## Changes

- `src/components/custom-site-host.tsx`, `src/app/globals.css`: remove the merchant notice/verified-products bar entirely. Published code fills the viewport. Private preview checkout displays a five-second host-owned status toast; iframe isolation and validated checkout messages remain unchanged.
- `src/app/media/[assetId]/route.ts`, `src/lib/media.ts`: anonymous, read-only image access and a merchant-scoped image library. Only ready assets explicitly marked `purpose=image` and PNG/JPEG/WebP/GIF/AVIF MIME types are admitted. Missing, incomplete, SVG, sample and deliverable assets return 404. There is no arbitrary R2-key lookup or remote-image proxy.
- `src/lib/uploads.ts`, `src/components/asset-upload.tsx`: retain owner-bound staged uploads and final-key copying, validate raster signatures, and add GIF/AVIF. Existing store/product image references are `/api/media/{id}`; imported Stan images already use this image-purpose storage. Custom sites get image-only `/media/{id}` URLs instead.
- `src/lib/custom-site.ts`, `src/lib/site-images.ts`, `src/lib/request-origin.ts`, the storefront/preview pages and API route: add absolute `Sore.store.photo` / `Sore.products[].image` URLs. Unsupported external URLs and SVG demo art become empty strings. Hosted URLs use the configured `APP_URL` origin; local pages use the request origin. Reserve `media` as a store slug.
- `src/components/storefront-editor.tsx`: public-image upload and selectable URL inputs in the manual editor; persistent AI capability help and an updated empty state.
- `src/lib/storefront-ai.ts`: capabilities, restrictions and supported alternatives in the prompt; no edits for restricted-only requests, clarification for vague requests, brief onboarding for fresh sites, uploaded-image context and exact-edit guidance. Response telemetry logs mode, tokens, stop reason, latency and Gateway id without source, prompts or secrets.
- `tests/runtime.test.ts`, `tests/runtime-worker.ts`, `tests/built-app.test.ts`: image upload/type/access tests, browser-policy header integration, absolute image URLs, merchant-only image context, mocked restricted replies and no-draft behavior, and absence of the old bar. README and deployment notes describe the new contract.

## Image route and exact policy

`GET /media/{assetId}` serves only public raster image assets. Successful responses send:

```text
Content-Type: image/png | image/jpeg | image/webp | image/gif | image/avif
X-Content-Type-Options: nosniff
Content-Disposition: inline
Content-Security-Policy: default-src 'none'
Cache-Control: public, max-age=31536000, immutable
ETag: <R2 object etag>
```

The route also has a specific Next header rule: integration testing caught Next's generic host CSP overwriting the route's own header. The specific rule fixes the actual bundled HTTP response, not just the service function.

Exact iframe CSP verified on port 3027:

```text
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob: http://localhost:3027/media/; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'
```

Only that absolute image origin/path changes in hosted mode. The host HTML keeps `Content-Security-Policy: frame-src 'self'`, and the iframe keeps `sandbox="allow-scripts"`, with no same-origin permission. Inline SVG remains supported as markup; uploaded SVG files are refused.

Images marked `purpose=image` are explicitly public immediately, including for unpublished stores and drafts. Both editor help and documentation disclose this. Public immutable URLs are not suitable for sensitive data or immediate revocation. Sample access keeps its existing separate checks; private paid files are never served here.

## Real AI calls

Eleven billed calls went through the local app's authenticated `/api/storefront/ai/chat` endpoint, Workers AI binding and configured `default` Gateway. Model response: `claude-haiku-5-5`; requested catalog model: `anthropic/claude-haiku-5.5`. Local D1/R2 persistence was isolated at `/tmp/sore-site-validation.htg2hz`; the existing port 3017 server and its storage were not used or stopped.

Latency below is the recorded model-binding round trip (the full API request was slightly longer). Token counts and stop reasons came from the real model response. Cost was **not exposed** in the response/local telemetry or inspected in the Gateway dashboard, so no dollar cost is claimed.

| Run | HTTP | Mode | Output tokens | stop_reason | Latency | Render/result | Gateway log id |
| --- | --- | --- | ---: | --- | ---: | --- | --- |
| Full fresh cream/plum site | 200 | files | 3,537 | tool_use | 15.294s | Passed, 3 real product buttons/prices | 01a20221-41d4-72ec-a406-a02ef5217214 |
| Hero-heading follow-up | 200 | edits | 772 | tool_use | 4.767s | Passed, heading changed only | 01a20222-cbdb-7625-b129-8f04487eb8be |
| Full navy/mint redesign | 200 | files | 3,514 | tool_use | 12.231s | Passed, responsive product grid | 01a20222-f5f1-7362-a5d0-06186f34ed0a |
| Use uploaded hero image | 200 | edits | 1,468 | tool_use | 7.055s | Passed, actual 900px raster loads | 01a20224-3fff-742a-84e6-199867a90728 |
| Add Google Analytics | 200 | guidance | 282 | end_turn | 2.687s | No files/draft-version change | 01a20224-ba51-75f3-bfc7-a52c2b178630 |
| Embed YouTube | 200 | guidance | 448 | end_turn | 3.298s | No edits; alternative-link issue found | 01a20224-c46a-70f2-aab5-7db82865854c |
| Working newsletter signup | 200 | guidance | 399 | end_turn | 2.869s | No files/draft-version change | 01a20224-d153-7075-b36c-1eec9471a29a |
| Change product to $5 | 200 | guidance | 340 | end_turn | 2.763s | No edits; directs to product editor | 01a20224-dcbc-75a7-9613-6a3204ea2dc6 |
| YouTube after prompt correction | 200 | guidance | 294 | end_turn | 4.050s | No edits; static image/text alternative | 01a20226-a49f-71ac-9249-cc4c7a2a7932 |
| Vague “Make it better” | 200 | guidance | 372 | end_turn | 3.019s | Offers options; no edits | 01a20226-b42e-778b-8720-d6d1463a498a |
| Change existing mailto to static text | 200 | edits | 608 | tool_use | 3.781s | Passed; no mailto links remain | 01a20227-c844-732e-8542-b09959c80b18 |

Total: **69,386 input tokens / 12,034 output tokens**. No max-token truncation, malformed tool input or unmatched find/replace occurred. All six guidance/clarification calls preserved draft version 4 and identical files. The first YouTube reply correctly refused an embed but incorrectly suggested an external clickable thumbnail/new tab. The prompt was tightened to forbid offering external/mailto/new-tab navigation, and the real recheck correctly explained that only a static image/description is supported. The final targeted edit also removed an earlier generated mailto link before local publication. Model guidance remains probabilistic; sandbox/CSP and server-side commerce validation are the enforcement layer.

## Browser verification

T3 preview navigation/evaluation worked, but two screenshot attempts failed with “The browser is not producing screenshot frames.” Verification switched to isolated headless local Google Chrome via Playwright installed under `/tmp`, without changing project dependencies.

- Historical files from the first three responses were rendered using the actual `customSiteDocument` wrapper in the real sandbox host; the image/final versions were also loaded through authenticated dashboard preview and anonymous published storefront routes.
- Desktop 1280px and mobile 390px layouts rendered without horizontal overflow. No unhandled browser JavaScript errors were observed. The iframe occupied the entire viewport (390×800 in preview, 1280×900 on the published page), without the old bar.
- Real product titles/prices stayed `$29.00`, `$19.00`, `$0.00`. `Sore.checkout` in preview stayed on the preview and displayed the host toast. On the published site it opened the platform product URL.
- An uploaded PNG loaded in the sandbox. `/api/media/...`, `/art/*.svg`, and an external image were blocked by actual `img-src` violations; platform `fetch` was blocked by `connect-src`.
- Store photo and product image fields were temporarily pointed to a real uploaded image and were exposed as absolute `/media/...` URLs. Manual UI image upload produced a selectable absolute URL; the persistent AI help panel rendered correctly.

Screenshots and raw verification evidence were kept under `/tmp/sore-*`, not checked into the repository. They contain fictional demo content only.

## Checkout verification and exact stopping point

**No real Stripe session, card payment or Stripe webhook was tested.** `.dev.vars` contained only the three local signing secrets: no Stripe secret/publishable keys or webhook signing secrets. The isolated demo had no connected account and `paymentsReady=0`; `/api/workspace` reported `stripeConfigured=false`. In `APP_MODE=development`, this app deliberately returns the local simulator for paid checkout even if keys are present. No live key was used, no card details were entered and no money moved.

Completed anonymously in local Chromium:

1. Published custom site → `Sore.checkout('clarity-guide')` → `/jamie-lane/p/clarity-guide`.
2. Platform product CTA → platform buyer-details form → free checkout.
3. Private access page → signed download → `clarity-guide.pdf`, **974 bytes**, `%PDF-1.4` signature.
4. Purchase recorded as `status=free`, amount 0; direct `/media/demo-clarity` returned 404.

Also completed the paid **development simulation**, not Stripe:

1. Custom site → `Sore.checkout('business-reset')` → product page → platform form → local `/checkout/{id}`.
2. The simulator correctly required development-merchant sign-in; an anonymous simulation attempt did not confirm payment.
3. After demo sign-in, “Simulate successful payment” confirmed the order through the app's confirmation service.
4. Private download returned `business-reset.pdf`, **990 bytes**; purchase recorded as `status=paid`, amount 2900. This is simulated payment evidence only, not Stripe TEST evidence.

To finish a true Stripe TEST verification, provide test-mode Stripe secret/publishable keys, an activated test connected account, the corresponding test Connect webhook signing secret plus local webhook forwarding, and use a locally isolated hosted-mode configuration that does not take the development simulator path. Creator authentication/entitlement must also be configured for hosted mode. Then pay only with Stripe's test card and verify the actual webhook, order and signed delivery. Real email sending was not tested; development delivery stays simulated.

## Cleanup and remaining risks

Final `npm run verify` passed: TypeScript, **80 service/runtime tests**, the real Next/OpenNext build, Wrangler's dry-run bundle check, and **15 bundled-app HTTP tests**. `git diff --check` also passed. No production deployment or remote migration was needed.

The primary checkout's D1/R2 state and port 3017 remained untouched. The isolated demo keeps the final navy/mint custom site with its uploaded Clarity hero illustration published, with no saved draft; verification orders/contacts/activity and the duplicate manual-upload test asset are removed. Temporary store/product image-field mutations are restored. All servers and browser sessions started for this validation are stopped/closed afterward.

Arbitrary merchant code can still mislead visitors, show false prices or consume CPU; only platform product pages own actual prices/payments/delivery. Public image caching cannot revoke copies already fetched. External images, scripts, fonts, embeds, forms, storage and custom domains are intentionally unsupported. Prompt wording is guidance, not a deterministic content filter. Broader abuse moderation and a dedicated untrusted-content origin remain launch considerations.
