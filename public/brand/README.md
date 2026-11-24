# sore brand assets

The six-petal emblem sits to the left of the complete lowercase **sore** wordmark, separated by a small gap.
Use the shared `Wordmark` / `Brand` components in `src/components/brand.tsx` for UI placements; keep ordinary prose and accessible names readable as “sore”.

- `sore-source.png`: original supplied artwork, unchanged.
- `sore-mark.png`: tightly framed, square transparent master. Near-transparent export noise below alpha 16 was removed; the gradient and petals are preserved.
- `sore-mark.webp`: 256px optimized UI version.
- `sore-mark-email.png`: 96px PNG for email clients.
- `sore-icon-32.png`: browser icon.
- `sore-icon-180.png`: Apple touch icon.
- `sore-icon-192.png`, `sore-icon-512.png`: app manifest icons with a small inset.
- `sore-social.png`: 1200 × 630 sharing card with the flower beside the full sore wordmark.
- `../favicon.ico`: 16, 32, 48, 64, 128 and 256px icon frames.

All marks retain transparency. The social card has a dark background. Icons are declared as `any`, since the transparent artwork is not a maskable icon.
