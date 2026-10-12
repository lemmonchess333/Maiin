# Public legal + support pages (App Store launch gate)

Apple's reviewer opens the Terms, Privacy, and Support URLs from the
**public web, outside the app** — the in-app `/terms` and `/privacy`
React routes don't satisfy that check, and a dead legal/Support URL is a
common first-submission rejection.

This directory stands up three **self-contained static pages** (no login,
no SPA, no external requests) so those URLs resolve:

| Page    | File                        | Content source                                |
| ------- | --------------------------- | --------------------------------------------- |
| Terms   | `public/legal/terms.html`   | generated from `src/pages/TermsOfService.tsx` |
| Privacy | `public/legal/privacy.html` | generated from `src/pages/PrivacyPolicy.tsx`  |
| Support | `public/legal/support.html` | new — contact + FAQ, `support@troposfit.com`  |

They live under `public/legal/` (not `public/`) so they never collide
with the SPA's own client-side `/terms` and `/privacy` routes. Vite
copies `public/**` verbatim into the build, so no `vite.config.ts` /
deploy change was needed. They cross-link each other with **relative**
filenames, so they work wherever the three files are hosted together.

## Where they resolve now (verify immediately)

After the next `main` deploy (GitHub Pages):

- `https://lemmonchess333.github.io/Maiin/legal/terms.html`
- `https://lemmonchess333.github.io/Maiin/legal/privacy.html`
- `https://lemmonchess333.github.io/Maiin/legal/support.html`

Open each in a private window (no login) to confirm.

## Operator steps to finish the gate (not agent-doable)

The real domain is **`troposfit.com`** (Cloudflare-managed). Apple's
listing must point at `troposfit.com/terms`, `/privacy`, `/support`.
Pick ONE hosting path:

1. **Cloudflare (simplest, since it already manages the domain).** Host
   these three files on Cloudflare Pages (or copy them to any static
   host) and add rules so `troposfit.com/terms`, `/privacy`, `/support`
   serve `terms.html`, `privacy.html`, `support.html`. Because they're
   self-contained, you can literally upload the three files.
2. **GitHub Pages custom domain.** Point `troposfit.com` at the Pages
   site. Note the app's Pages base path is `/Maiin/`, so without a
   redirect these resolve at `troposfit.com/Maiin/legal/*.html` — add a
   Cloudflare redirect from the clean `/terms` paths if you want them.

Then, in **App Store Connect**:

- Set the **Support URL** field to `https://troposfit.com/support`.
- Update the two links in the **Description** footer to
  `https://troposfit.com/terms` and `https://troposfit.com/privacy`.
- Do NOT submit with placeholder links — all three must resolve with no
  login first.

## Keeping them in sync

The Terms and Privacy copies are generated from the in-app pages, not
written by hand: run `npm run legal:sync` after changing
`TermsOfService.tsx` or `PrivacyPolicy.tsx`, and commit the result.
`scripts/legal-pages.test.ts` fails while either copy says something its
page doesn't. They used to be transcribed by hand, and by October 2026
the privacy copy was five months behind, still promising deletion
"within 30 days". The support page is written by hand; it has no in-app
counterpart.
