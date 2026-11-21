# Default site theme

The default Coachlane theme uses the supplied DIMIGO gradient: `linear-gradient(to right, #ec008c, #fc6767)`.

- Pink/coral gradient: primary actions, wordmark icon, sign-in artwork and the default Studio purchase button.
- Deep magenta: readable text links, active navigation and focus accents.
- Soft rose and peach: cards, decorative surfaces, selection states and borders.
- Dark text on the gradient preserves contrast at its coral end; white cards and the existing typography remain.
- New storefront defaults use `#ec008c`. Editorial and Botanical presets and saved creator data are preserved.
- The login email uses the matching palette, with a solid-color fallback for mail clients that ignore gradients.

Validation: TypeScript, Next.js/OpenNext build, staging dry-run bundle and all 61 existing tests pass. The email test's expected brand color was updated; no new tests were added for this visual change.

Live app version: `5ba32100bf9d498c8dc5c32ac3c83c65`. The desktop homepage was visually inspected through Cloudflare Browser Rendering. Mobile sign-in computed the exact requested gradient, dark labels and no horizontal overflow at 390 pixels. No real email was sent for this visual update; the refreshed email preview is included locally.
