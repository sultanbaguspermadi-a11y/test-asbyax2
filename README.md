# سكرابل عربي — Arabic Scrabble

Two-player (hot-seat) Arabic Scrabble that runs in any modern browser, installs as a PWA, works offline, and checks every word it forms against a Modern Standard Arabic lexicon.

> **Read this first:** the lexicon shipped in this repository is a small *seed* (~600 entries) so the validator can be demonstrated and tested. A large Wiktionary-based lexicon can be generated with one command (see [docs/DICTIONARY.md](docs/DICTIONARY.md)). Until you do that, expect valid words to show as "not in the dictionary"; by default the game then *asks the players* instead of rejecting.

## Features

* Original rules preserved: 15×15 board, same 84-tile distribution and values (incl. 2 blanks), premium squares, 50-point bingo, 25-minute clock per player (starts after the first move), swap, pass, undo of the last move, end-of-game rack deduction and time bonus.
* Word validation for every word formed (including crossing words) with live ✓ / ؟ chips and a score preview while you place tiles; policies *Strict* / *Expanded*; custom word list; challenge dialog; optional "block invalid moves".
* Touch, mouse and keyboard: pointer-based drag & drop (works on phones — the original HTML5 drag did not), tap-to-place, arrow-key board navigation (RTL-aware), `1`–`7` to pick rack tiles, screen-reader labels, native `<dialog>`s, visible focus, reduced-motion support. Validity and turn state never rely on colour alone.
* Responsive layout driven by container queries: portrait phones, landscape phones, tablets, laptops, ultrawide and TV-sized viewports; safe-area insets; board never needs sideways scrolling.
* Light and dark themes (emerald / midnight / ivory / muted gold), follows the OS until you choose, choice persisted, no flash on load. Contrast of the colour tokens is unit-tested (WCAG AA).
* Autosave: reload or close the tab and the game (board, racks, bag, scores, clocks) is restored. The clock is paused while the page is closed.
* PWA: manifest, icons (incl. maskable), service worker with build-hashed precache, network-first HTML, update prompt (never swaps code mid-move), offline fallback.
* No framework, no runtime dependencies, no build tools to install.

### Changes from the original project (please review)

* The **opponent's rack is hidden by default** (original showed both racks). Settings → "Show the other player's rack" restores the original behaviour.
* Tailwind CDN, the Google-Fonts `@import`, and the dead Firebase code were removed; a hand-written stylesheet replaced them. The GitHub-Pages deploy workflow was replaced by a CI workflow (tests + build); hosting is Vercel.
* Blank tiles now reset their chosen letter when recalled/undone/swapped (the original kept it).
* The heh tile's canonical letter is `ه` (displayed as `هـ`), so word strings contain no tatweel.
* New: shuffle rack, autosave, move preview, bag counter, rack reordering by drag, custom dictionary.
* Kept as-is: the tile set has no `ء`, `ة`, `ى` tiles, so words requiring a stand-alone hamza cannot be formed; alef/ya/ta-marbuta variants are matched through the tile fold (documented in docs/DICTIONARY.md).

## Stack and structure

Vanilla ES modules + CSS (Node ≥ 20 only for scripts/tests; zero npm dependencies).

```
public/                 deployable site (copied to dist/ by the build)
  index.html  manifest.webmanifest  sw.js
  css/app.css           design tokens (light/dark) + layout
  js/main.js            UI controller          js/pwa.js  install/update/offline notices
  js/game/              constants, rules (placement+scoring), game (state, clock, undo, save) — no DOM
  js/arabic/            normalize, lexicon, morphology, validator, engine, worker, client
  js/ui/                drag, text      js/store.js  settings/save storage
  data/lexicon/         meta.json + lexicon files
  icons/
scripts/                build.mjs  serve.mjs  build-lexicon.mjs  make-icons.mjs
tests/                  node:test unit tests + tests/e2e (Playwright, optional)
docs/DICTIONARY.md      validation architecture, sources, licences, limits
vercel.json  package.json  .github/workflows/ci.yml
```

## Develop, test, build

```bash
npm run dev            # serves public/ at http://localhost:5173 (applies the same headers/CSP as vercel.json)
npm test               # 38 unit tests: normalization, lexicon, morphology, validator, rules, scoring, game flow, clock, undo, save/restore, SW, contrast, lexicon builder
npm run build          # public/ -> dist/ with hashed lexicon names + service-worker precache list
npm start              # build, then serve dist/ at http://localhost:5173
npm run test:e2e       # browser tests; needs Playwright (not a dependency): `npm i -D playwright && npx playwright install chromium`
                       # (or set PLAYWRIGHT_PATH to an existing install). Run `npm run build` first.
```

## Deploy

**GitHub:** `git init && git add . && git commit -m "Arabic Scrabble v2" && git remote add origin https://github.com/axegavnewdevice-commits/asbyaxegavi.git && git push -u origin main` (use `--force` only if you intend to replace the old history; or work on a branch and open a PR). CI runs tests and the build on every push.

**Vercel:** Import the GitHub repository. Framework preset **Other**; the settings come from `vercel.json` (Build `node scripts/build.mjs`, Output `dist`, no install step needed). No environment variables are used or required; nothing secret is in the frontend. The app is a single page at `/`: there are no client-side routes, so no rewrites are configured (and none can intercept the service worker, manifest, icons or assets). Headers: security headers + CSP (self only, plus Google Fonts), `sw.js` is never cached, manifest has the right content type.

Fonts load from Google Fonts (IBM Plex Sans Arabic, Noto Naskh Arabic) with a full system fallback stack; the service worker caches them after first use. To self-host, add the WOFF2 files and `@font-face` rules and remove the `<link>` created at the top of `js/main.js` plus the Google hosts from the CSP.

## PWA and offline

After the first visit the service worker precaches every file (including the lexicon), so gameplay *and* word validation work offline. HTML is fetched network-first (3 s timeout) so deploys show up immediately; if a new version is found the game shows "update available" and swaps only when you tap it (the game is autosaved anyway). Install: Chrome/Edge/Android show an install button in the header; on iOS/iPadOS use Share → "Add to Home Screen" (the header button explains this). iOS does not offer an install prompt, and PWA behaviour differs between browsers and iOS versions.

## What was verified (and what was not)

Run in this environment: 38 unit tests pass (`npm test`); 32 Chromium browser checks pass (`npm run test:e2e`): no console errors/CSP violations/failed requests, RTL, dictionary loaded in a Web Worker, tap-to-place, mouse drag, real touch-event drag, valid/unknown/blocked word flows, blank-tile dialog, keyboard navigation, theme persistence and OS-scheme handling, autosave across reload, service-worker install and **full offline reload with validation**, manifest and icon sizes, and a layout matrix of 16 viewports (320×568 up to 3840×2160, landscape phones, 3440×1440, a 400 %-zoom-equivalent 320×240) checking no horizontal overflow, square board, tile sizes, visible controls and no overlaps. Screenshots are written to `tests/e2e/shots/`.

**Not verified:** Firefox/Safari/WebKit; real iPhone/Android/iPad/TV devices and touch ergonomics; Lighthouse/Core Web Vitals (no measurement was made, so no performance claims are made); the Web fonts' real appearance (the sandbox had no internet, so screenshots use fallback fonts — tile letters are centred with grid but should be eyeballed with Noto Naskh Arabic); the Wiktionary builder on a real dump; actual Vercel deployment and GitHub push (no access to either from here).

## Known limitations

* The shipped lexicon is a seed; see docs/DICTIONARY.md. Morphology is bounded (sound regular verbs, regular nominal affixes only).
* Hot-seat only (as in the original); no online play, AI opponent or tile-bag settings.
* On the smallest phones (≈320 px wide) board cells are ≈14 px; use the browser's pinch-zoom or a larger device.
* Undo reverts one move only (as before) and does not give back clock time.
