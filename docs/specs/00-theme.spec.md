# 00 · Theme spec: design tokens and global CSS

**Owner:** Neel (`app/layout.tsx`, `app/globals.css`). Everyone else *consumes* these tokens and never edits those two files; ask for a token in the PR that changes this spec.
**Used by:** plans 03, 05, 07, 08, 09, 10, 11, 12, 13.
**Look:** SpaceX's black, wide-tracked, uppercase style with xAI's quiet panels and warm accent. Our own name is **Teardown**. No logos, wordmarks, photos or font files from either company.

## 1. What was measured

Public pages, read on 2026-10-16. spacex.com was read from its published HTML and stylesheet (`styles.*.css`) plus computed styles in a browser. x.ai blocks plain downloads (Cloudflare challenge), so it was read only through computed styles and `:root` variables in a browser. Nothing was downloaded into the repo. All code below is written fresh from the values, not pasted.

| Source | Pages |
|---|---|
| **SPX** spacex.com | `/` and `/vehicles/falcon-9/` |
| **XAI** x.ai | `/` and `/api` |

## 2. Token table

### Colour

| Token | Value | Source |
|---|---|---|
| `--bg` | `#000000` | SPX `.app-background { background-color:#000 }` |
| `--surface-1` | `#0A0A0A` | XAI `body` bg `rgb(10,10,10)`, `--color-jet` |
| `--surface-2` | `#151515` | XAI computed panel bg `rgb(21,21,21)` |
| `--surface-3` | `#1A1A1A` | XAI card bg `rgb(26,26,26)` (used at 60% with blur) |
| `--text` | `#F0F0FA` | SPX `--white-100: rgba(240,240,250,1)` and `body` colour |
| `--text-90` | `rgba(240,240,250,.9)` | SPX `--white-90`, nav links `.nav-links a` |
| `--text-muted` | `rgba(240,240,250,.7)` | SPX `--white-70` |
| `--text-dim` | `rgba(240,240,250,.6)` | SPX `--white-60`; XAI eyebrow `rgba(255,255,255,.6)` |
| `--line-strong` | `rgba(240,240,250,.5)` | SPX `--white-50` (our outline-button border) |
| `--line` | `rgba(240,240,250,.35)` | SPX `a { border:1px solid var(--white-35) }` (button border) |
| `--line-soft` | `rgba(240,240,250,.15)` | SPX `--white-15`; XAI card border `rgba(255,255,255,.08)` |
| `--fill-1` | `rgba(240,240,250,.1)` | SPX `--white-10` (round icon button bg, hover fill) |
| `--fill-2` | `rgba(240,240,250,.25)` | SPX `--white-25` (pressed fill) |
| `--scrim-50` / `--scrim-80` | `rgba(0,0,0,.5)` / `rgba(0,0,0,.8)` | SPX `--black-50` (button bg), `--black-80` |
| `--accent` | `#FFB547` | **Ours.** Hue 36 deg, 11.95:1 on black. Same hue family as XAI `--color-dawn` (`hsl(37 100% 76%)`) but deeper. SPX has no accent colour (pure monochrome) |
| `--accent-hover` | `#FFD085` | XAI `--accent-hover: var(--color-dawn)` = `hsl(37 100% 76%)` |
| `--flame` | `#FF6308` | XAI `--color-sunset` `hsl(22 100% 51.6%)`; computed `rgba(255,99,8,.1)` tint bg. Engines, fire, danger glow only |
| `--ok` | `hsl(142 71% 45%)` | XAI `--success` |
| `--warn` | `hsl(45 93% 47%)` | XAI `--warning` |
| `--bad` | `hsl(0 84% 60%)` | XAI `--error` |
| `--info` | `hsl(214 49% 74%)` | XAI `--info` = `--color-breeze` |
| `--bad-text` | `#FF8A8A` | Ours. A lighter red for words and numbers (5.9:1 on a chip); `--bad` is for icons and glows only |
| `--panel` / `--panel-hud` | `rgba(10,10,10,.94)` / `rgba(0,0,0,.88)` | Ours. Opaque-enough reading surfaces (SPX uses `.5` scrims over video, which fails over a white rocket); see section 6 |
| `--phase-1/2/3` | flame / accent / info | Ours, emissions bar; always with a pattern and a label |
| `--qr-paper` | `#FFFFFF` | Ours: QR codes need a light quiet zone (21:1 with black modules) |

### Type

| Token | Value | Source |
|---|---|---|
| `--font-display` | Barlow Semi Condensed, 600 / 700 | Stand-in for SPX `D-DIN-Bold` (headings) |
| `--font-body` | Barlow, 400 / 500 / 600 / 700 | Stand-in for SPX `D-DIN` (body, buttons) |
| `--font-mono` | Roboto Mono | SPX `.section-subheader` and `@font-face Roboto Mono` (open licence, so we use the real family) |
| heading transform | `uppercase` | SPX `h1,h2,h3,h4` |
| heading tracking | `.02em` (`--track-head`) | SPX `h1,h2 { letter-spacing:.02em }`; computed 36px h2 = `0.72px` |
| display tracking | `-.01em` (`--track-display`) | SPX hero `.inner-center h1 { letter-spacing:-1px; font-size:100px }`, section title `-1px` at 60px |
| eyebrow tracking | `.08em` | SPX `.section-subheader` (mono, uppercase, `.875rem`) |
| nav / label tracking | `.09em`, 700, uppercase | SPX `.nav-links a { font-size:.813rem; letter-spacing:.09em }` |
| line height, body | `1.6` | SPX `body` 16px / 26px, `p` 1.6 on mobile |
| line height, headings | `.95` to `1` | SPX `h1 { line-height:95% }`, `.hero h2 95%`, 48px / 48px |
| XAI contrast case | sentence-case 500 wt, `-.01em` | XAI `h1` 36px / 450 / `-0.36px`; used **only** for the Imagine caption text (see §6) |

Reference sizes measured (desktop): SPX display 100, section title 60, `h2` 48 (mobile 36), `h2` 36, inner `h2` 20, `h3` 20 (0.02em), button text 12, nav 13, body 16/26, footer 12, eyebrow 14. XAI `h1` 36, `h2` 36 / 30 / 24, `h3` 16, body 16–18, label 10 uppercase `.5px`, nav 13, button 14.

### Our type scale (base 18 px, 20 px at 1500 px wide, 22 px at 1920 px wide)

SPX is 16 px body for a person at arm's length. A walk-up exhibit is read from about a metre, so our `rem` base is 1.125 to 1.375 times larger and the scale keeps SPX's ratios.

| Token | rem | px at 18 | SPX equivalent |
|---|---|---|---|
| `--fs-display` | `clamp(3rem, 7vw, 6.25rem)` | 54 to 112 | 100 hero (50 mobile) |
| `--fs-h1` | `clamp(2.25rem, 4.4vw, 3.75rem)` | 40 to 67 | 60 section title |
| `--fs-h2` | `clamp(1.875rem, 3.2vw, 3rem)` | 34 to 54 | 48 / 36 |
| `--fs-h3` | `clamp(1.5rem, 2.2vw, 2.25rem)` | 27 to 40 | 36 |
| `--fs-h4` | `1.375rem` | 25 | 20 |
| `--fs-body` | `1rem` | 18 | 16 |
| `--fs-lead` | `1.25rem` | 22 | 18 (`.inner-center-top`) |
| `--fs-small` | `.875rem` | 15.75 | 14 |
| `--fs-caption` | `.8125rem` | 14.6 | 12 to 13 (**floor: nothing on screen is smaller**) |

### Space, shape, layout

| Token | Value | Source |
|---|---|---|
| `--sp-1 .. --sp-8` | 4, 8, 12, 16, 24, 40, 60, 100 px | SPX: 12 / 15 / 16 / 20 / 24 / 40 / 60 / 100 (`.footer { margin:12px 60px }`, `nav { padding:24px 40px }`, `.inner-left-middle { left:100px }`, `.buttons { gap:16px }`) |
| `--container` | `1400px` | SPX `.section-inner { max-width:1400px }` |
| `--measure` | `32.5rem` (520 px at 16) | SPX text column `max-width:520px` |
| `--measure-center` | `60rem` (960 px at 16) | SPX `.inner-center { max-width:960px }` |
| `--radius-sm` | `4px` | SPX buttons, `.upcoming-launch-widget` |
| `--radius-md` | `.5rem` | XAI `--radius: .5rem` |
| `--radius-pill` | `9999px` | XAI pill buttons |
| `--target` | `48px` | SPX button `height:48px`, round icon button 48x48, and our exhibit floor |
| `--target-lg` | `64px` | Ours (primary exhibit actions) |
| breakpoints | 961, 1279, 1350, 1500 px | SPX `@media (max-width: 961px)`, `1279`, `1350`, `1500`; XAI 640 / 768 / 1024 / 1280 / 1536 |

### Motion

| Token | Value | Source |
|---|---|---|
| `--ease-out` | `cubic-bezier(.19, 1, .22, 1)` | SPX button `transition: background-color .5s cubic-bezier(.19,1,.22,1)` |
| `--ease-ui` | `cubic-bezier(.4, 0, .2, 1)` | XAI `transition: color .15s cubic-bezier(.4,0,.2,1)` |
| `--ease-overlay` | `cubic-bezier(.25, .8, .25, 1)` | SPX `.cdk-overlay-backdrop` `.4s` |
| `--dur-fast` / `--dur` / `--dur-slow` | `.15s` / `.5s` / `.75s` | XAI / SPX button / SPX `.reveal-header` (`.75s ease-in-out`, sub `.5s` delay, button `1s` delay) |
| overlay dim | `backdrop-filter: brightness(.5)` | SPX `.overlay` |
| panel blur | `blur(6px)` (HUD), `blur(4px)` (card) | SPX component CSS `backdrop-filter: blur(6px)`; XAI card `blur(4px)` |
| hero scrims | `linear-gradient(180deg, rgba(0,0,0,.6) 0%, transparent 95%)`, `.5 to 0`, and a 4-stop `.75 / .55 / .25 / 0` | SPX component CSS |

### Components measured

| Component | Measured values | Source |
|---|---|---|
| Primary button (hover rule is not exposed in SPX's stylesheet; our `.btn:hover` fill and `.btn` label tracking `.09em` are our choices, borrowed from its nav) | 48 px high, `padding:0 20px`, `1px solid rgba(240,240,250,.35)`, radius 4, bg `rgba(0,0,0,.5)`, label 12 px uppercase, `.5s` ease-out | SPX `a.spx-button.primary` |
| Round icon button | 48x48, radius 50%, bg `rgba(240,240,250,.1)` | SPX carousel button |
| XAI primary pill | 14 px / 500, `padding:12px 20px`, radius 9999, white bg, `#0A0A0A` text | XAI "Get API Access" |
| XAI secondary pill | 14 px / 500, `padding:10px 18px`, bg `#202020`, white text | XAI "Contact Sales" |
| Nav | transparent over hero, `padding:24px 40px`, links 13 px bold uppercase `.09em`, `--white-90` going to `--white-100` on hover | SPX `nav`, `.nav-links` |
| Footer | 12 px uppercase, `margin:12px 60px`, space-between | SPX `.footer`, `.footer-text` |
| Stat table | label 14 px uppercase, value 16 px | SPX Falcon 9 `td.metric-label`, `td.metric-value` |
| Card | `rgba(26,26,26,.6)`, `1px solid rgba(255,255,255,.08)`, `blur(4px)` | XAI floating pill/card |
| Code / mono | 13 px, `#E1E4E8` | XAI `pre` |

## 3. Reconciling with `docs/plans/00-index.md`

| Item | Index says | Measured | Winner and why |
|---|---|---|---|
| Background | `#000` | `#000` (SPX) | Same. |
| Text | `#F0F0FA` | `#F0F0FA` (SPX `--white-100`) | Same, confirmed exactly. |
| Highlight | `#FFB547` | SPX has none; XAI uses warm `dawn #FFD085` and `sunset #FF6308` | **`#FFB547` stays** as our accent. It is not copied from either site, it is in the same warm hue (36 vs 37 deg) as XAI's accent, and it reaches 11.95:1 on black. Hover uses XAI's real `#FFD085`. `--flame #FF6308` is added from XAI for engines and fire only. |
| Display font | Barlow Semi Condensed | D-DIN-Bold (proprietary) | Index wins: closest free semi-condensed DIN-like face. Substitution recorded here. |
| Body font | Barlow | D-DIN (proprietary) | Index wins. |
| Mono | not in index | Roboto Mono (SPX, open licence) | Added, used for eyebrows and numbers in HUDs. |
| xAI font | not in index | `xVf` (proprietary) | Not used. Imagine caption text uses Barlow 500 sentence case instead. |
| Footer line | "Student project, not affiliated with SpaceX." | x.ai footer now reads "SpaceXAI LLC" | **Footer becomes "Student project. Not affiliated with SpaceX or xAI."** (the challenge is the SpaceXAI one). Index text should be updated to match when 01 is next edited. |
| Touch target | 48 px | SPX buttons are 48 px | Same, and primary actions go to 64 px. |
| Button look | Plan 03 Task 3: 2 px `#F0F0FA` border, invert on hover | SPX 1 px `.35` border, `.5` black fill | **Plan 03 wins** (visible on white imagery, 18.5:1 edge, simple to see on a touchscreen). SPX shape, uppercase and 48 px height are kept. |
| Level switch | Plan 03 Task 6: Kid · Curious · Engineer | n/a | Plan 03; the `.seg` has three buttons. |
| Engine colours | Plan 08: running = `#FFB547` glow, out = dim red with an X, verdict yes green / barely amber / no red | XAI `--flame` | Plan 08 wins for the toggles (accent) and verdict chips (`--ok`, `--warn`, `--bad-text`); `--flame` is used only for the 3D exhaust glow and big emissions numbers. |
| Motto / sentences | Motto is a sentence | SPX uppercases everything | Sentences stay sentence case (`.display--sentence`, `.legal`). |
| Body size | not set | SPX 16 px | Exhibit scale is larger (§5). |
| Tailwind | not in stack | n/a | Plain CSS in `app/globals.css`; no new dependency. |

## 4. `app/layout.tsx` font setup

All three families are Google Fonts (open licences), loaded through `next/font/google`, so they are self-hosted at build time and need no network on the exhibit Wi-Fi. Do **not** add D-DIN or xVf files.

```tsx
// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Semi_Condensed, Roboto_Mono } from "next/font/google";
import "./globals.css";

const display = Barlow_Semi_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--nf-display",
  display: "swap",
});
const body = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--nf-body",
  display: "swap",
});
const mono = Roboto_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--nf-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Teardown",
  description: "Bringing rocket science down to Earth.",
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        {children}
        <footer className="legal">
          <span>Student project. Not affiliated with SpaceX or xAI.</span>
          <span>
            Model: &ldquo;Falcon 9 - SpaceX&rdquo; by Stanley Creative,{" "}
            <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>
          </span>
        </footer>
      </body>
    </html>
  );
}
```

Notes: do not put `maximum-scale` or `user-scalable=no` in the viewport (it blocks pinch-zoom, an accessibility failure). `/rocket` may render its own full-screen layout, but it must still show the legal line once, at the end of its first screen's scroll area or on its "About" sheet.

## 5. `app/globals.css` (drop-in)

```css
/* Teardown theme. Values measured from public spacex.com and x.ai styles and
   rewritten here; no vendor CSS or fonts are included. See docs/specs/00-theme.spec.md. */

:root {
  color-scheme: dark;

  /* Colour: surfaces */
  --bg: #000000;
  --surface-1: #0a0a0a;
  --surface-2: #151515;
  --surface-3: #1a1a1a;

  /* Colour: text. 240 240 250 is the measured SpaceX off-white. */
  --text: #f0f0fa;
  --text-90: rgba(240, 240, 250, 0.9);
  --text-muted: rgba(240, 240, 250, 0.7); /* floor for readable text: 8.9:1 on #000 */
  --text-dim: rgba(240, 240, 250, 0.6); /* 6.6:1; large or decorative text only */

  /* Colour: lines and fills */
  --line-strong: rgba(240, 240, 250, 0.5); /* 4.8:1 on #000, button outlines */
  --line: rgba(240, 240, 250, 0.35);
  --line-soft: rgba(240, 240, 250, 0.15);
  --fill-1: rgba(240, 240, 250, 0.1);
  --fill-2: rgba(240, 240, 250, 0.25);
  --scrim-50: rgba(0, 0, 0, 0.5);
  --scrim-80: rgba(0, 0, 0, 0.8);

  /* Colour: accent and status */
  --accent: #ffb547; /* our highlight, 11.95:1 on #000 */
  --accent-hover: #ffd085;
  --accent-ink: #000000;
  --accent-tint: rgba(255, 181, 71, 0.12);
  --flame: #ff6308;
  --flame-tint: rgba(255, 99, 8, 0.12);
  --ok: hsl(142 71% 45%);
  --warn: hsl(45 93% 47%);
  --bad: hsl(0 84% 60%); /* icons, glows, fills only (3.5:1 inside a chip) */
  --bad-text: #ff8a8a; /* every red WORD or number: 5.9:1 inside a chip on #1a1a1a */
  --info: hsl(214 49% 74%);
  --qr-paper: #ffffff;

  /* Reading surfaces. Opaque enough that text keeps 7.7:1 or better even over a
     white rocket or a bright Imagine picture. Text never sits on bare canvas. */
  --panel: rgba(10, 10, 10, 0.94); /* cards, sheets: text 15.5:1, muted 8.2:1 over white */
  --panel-hud: rgba(0, 0, 0, 0.88); /* HUDs, default buttons: text 14.6:1, muted 7.7:1 over white */

  /* Emissions phase colours. Always paired with a pattern (.phase--*) and a word. */
  --phase-1: var(--flame);
  --phase-2: var(--accent);
  --phase-3: var(--info);

  /* Fonts. --nf-* are set by next/font in app/layout.tsx. */
  --font-display: var(--nf-display, "Barlow Semi Condensed"), "Arial Narrow", Arial, sans-serif;
  --font-body: var(--nf-body, "Barlow"), Arial, Helvetica, sans-serif;
  --font-mono: var(--nf-mono, "Roboto Mono"), ui-monospace, "SFMono-Regular", Menlo, monospace;

  /* Tracking */
  --track-head: 0.02em;
  --track-display: -0.01em;
  --track-eyebrow: 0.08em;
  --track-label: 0.09em;

  /* Type scale. Exhibit base is 18px (see html rules below). */
  --fs-display: clamp(3rem, 7vw, 6.25rem);
  --fs-h1: clamp(2.25rem, 4.4vw, 3.75rem);
  --fs-h2: clamp(1.875rem, 3.2vw, 3rem);
  --fs-h3: clamp(1.5rem, 2.2vw, 2.25rem);
  --fs-h4: 1.375rem;
  --fs-lead: 1.25rem;
  --fs-body: 1rem;
  --fs-small: 0.875rem;
  --fs-caption: 0.8125rem; /* legal and credit lines only; HUD keys, chips, badges use --fs-small */

  /* Space */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 24px;
  --sp-6: 40px;
  --sp-7: 60px;
  --sp-8: 100px;

  /* Shape and layout */
  --radius-sm: 4px;
  --radius-md: 0.5rem;
  --radius-pill: 9999px;
  --container: 1400px;
  --measure: 32.5rem;
  --measure-center: 60rem;
  --target: 48px; /* minimum touch target */
  --target-lg: 64px; /* primary exhibit actions */
  --gutter: clamp(16px, 4vw, 60px);

  /* Motion */
  --ease-out: cubic-bezier(0.19, 1, 0.22, 1);
  --ease-ui: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-overlay: cubic-bezier(0.25, 0.8, 0.25, 1);
  --dur-fast: 0.15s;
  --dur: 0.5s;
  --dur-slow: 0.75s;

  /* Layers */
  --z-canvas: 0;
  --z-hud: 10;
  --z-chrome: 20;
  --z-overlay: 100;
  --z-toast: 200;
}

/* Base size: bigger than the 16px web default for walk-up viewing. */
html {
  font-size: 18px;
  background: var(--bg);
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
@media (min-width: 1500px) {
  html { font-size: 20px; }
}
@media (min-width: 1920px) {
  html { font-size: 22px; }
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--fs-body);
  font-weight: 400;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

h1, h2, h3, h4 {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: var(--track-head);
  line-height: 1;
  color: var(--text);
}
h1 { font-size: var(--fs-h1); line-height: 0.95; letter-spacing: var(--track-display); }
h2 { font-size: var(--fs-h2); }
h3 { font-size: var(--fs-h3); }
h4 { font-size: var(--fs-h4); font-weight: 600; }

p { margin: 0; max-width: var(--measure); }
.lead { font-size: var(--fs-lead); line-height: 1.5; }
small, .small { font-size: var(--fs-small); }
.muted { color: var(--text-muted); }

a {
  color: var(--text);
  text-decoration-color: var(--line-strong);
  text-underline-offset: 0.2em;
  transition: color var(--dur-fast) var(--ease-ui);
}
a:hover { color: var(--accent-hover); }

button, input, select, textarea { font: inherit; color: inherit; }
button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }

:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 3px;
  border-radius: var(--radius-sm);
}

::selection { background: var(--accent); color: var(--accent-ink); }

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* Layout helpers */
.container {
  width: 100%;
  max-width: var(--container);
  margin-inline: auto;
  padding-inline: var(--gutter);
}
.stack > * + * { margin-top: var(--sp-4); }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-4); }

/* Display heading, for attract screen and the /rocket status word */
.display {
  font-family: var(--font-display);
  font-size: var(--fs-display);
  font-weight: 700;
  line-height: 0.95;
  letter-spacing: var(--track-display);
  text-transform: uppercase;
}

/* Full sentences set large (the motto): sentence case, no tracking */
.display--sentence { text-transform: none; letter-spacing: 0; line-height: 1.05; }

/* Eyebrow: small mono label above a heading */
.eyebrow {
  margin: 0 0 var(--sp-3);
  font-family: var(--font-mono);
  font-size: var(--fs-small);
  font-weight: 400;
  line-height: 1.4;
  letter-spacing: var(--track-eyebrow);
  text-transform: uppercase;
  color: var(--text-muted);
}

/* Buttons. Every button is at least 48px tall and wide. */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  min-height: var(--target);
  min-width: var(--target);
  padding: 0 24px;
  border: 2px solid var(--text); /* plan 03: 2px opaque off-white (wins over SpaceX's 1px .35) */
  border-radius: var(--radius-sm);
  background: var(--panel-hud);
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--fs-small);
  font-weight: 600;
  letter-spacing: var(--track-label);
  line-height: 1;
  text-transform: uppercase;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  transition:
    background-color var(--dur) var(--ease-out),
    border-color var(--dur) var(--ease-out),
    color var(--dur) var(--ease-out),
    transform var(--dur-fast) var(--ease-ui);
}
.btn:hover { background: var(--text); border-color: var(--text); color: var(--accent-ink); } /* plan 03: invert on hover */
.btn:active { transform: scale(0.98); background: var(--fill-2); color: var(--text); }
.btn[disabled], .btn[aria-disabled="true"] { opacity: 0.45; cursor: not-allowed; pointer-events: none; }

/* Transparent: only on a .card, .sheet or .overlay__panel, never straight on the canvas */
.btn-outline { background: transparent; }
.btn-outline:hover { background: var(--text); }

/* One accent button per screen: the main next step */
.btn-accent { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.btn-accent:hover { background: var(--accent-hover); border-color: var(--accent-hover); color: var(--accent-ink); }
.btn-accent:active { background: var(--accent); }

.btn-lg { min-height: var(--target-lg); min-width: var(--target-lg); padding: 0 40px; font-size: var(--fs-body); }
.btn-icon { padding: 0; border-radius: 50%; }
.btn-icon.btn-lg { padding: 0; }
.btn[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.btn[aria-pressed="true"]:hover { background: var(--accent-hover); border-color: var(--accent-hover); }

/* Stat: big number plus label */
.stat { display: flex; flex-direction: column; gap: var(--sp-1); }
.stat__value {
  font-family: var(--font-display);
  font-size: var(--fs-h2);
  font-weight: 700;
  line-height: 1;
  letter-spacing: var(--track-head);
  font-variant-numeric: tabular-nums;
  color: var(--text);
}
.stat__unit { margin-left: 0.25em; font-size: 0.5em; color: var(--text-muted); letter-spacing: var(--track-label); }
.stat__label {
  font-size: var(--fs-small);
  font-weight: 500;
  letter-spacing: var(--track-label);
  text-transform: uppercase;
  color: var(--text-muted);
}
.stat--accent .stat__value { color: var(--accent); }
.stat--flame .stat__value { color: var(--flame); }

/* Card: quiet panel on black */
.card {
  padding: var(--sp-5);
  background: var(--panel);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-md);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
  color: var(--text);
}
.card > * + * { margin-top: var(--sp-3); }
.card--solid { background: var(--surface-3); }

/* Chip: small pill for tags, source badges and status */
.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: 32px;
  min-width: 32px;
  justify-content: center;
  padding: 0 var(--sp-3);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-pill);
  background: var(--fill-1);
  font-size: var(--fs-small);
  font-weight: 600;
  letter-spacing: var(--track-eyebrow);
  text-transform: uppercase;
  color: var(--text);
}
a.chip, button.chip { min-height: var(--target); min-width: var(--target); padding: 0 var(--sp-4); cursor: pointer; text-decoration: none; }
/* Chips sit on .card, .hud or .sheet only: their fills are contrast-tested there. */
.chip--ok { color: var(--ok); }
.chip--warn { color: var(--warn); }
.chip--bad { color: var(--bad-text); }
.chip--info { color: var(--info); }
.chip--est { border-style: dashed; border-color: var(--line-strong); } /* estimate: dashed edge plus the word */
.chip--accent { color: var(--accent); border-color: var(--accent); }

/* HUD: readouts floating over the 3D canvas. The host needs position: relative;
   place a HUD with top/left/right/bottom set by the host component. */
.hud {
  position: absolute;
  z-index: var(--z-hud);
  display: grid;
  gap: var(--sp-2);
  padding: var(--sp-4) var(--sp-5);
  background: var(--panel-hud);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-sm);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  font-family: var(--font-mono);
  font-size: var(--fs-small);
  line-height: 1.3;
  color: var(--text);
  pointer-events: auto; /* a HUD may hold controls: Launch, Pause, scrubber, source links */
}
.hud--passive { pointer-events: none; } /* read-only readout: drags pass through to the canvas */
.hud--interactive { pointer-events: auto; } /* readable alias of the default */
.hud__row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-5); }
.hud__k { font-size: var(--fs-small); letter-spacing: var(--track-eyebrow); text-transform: uppercase; color: var(--text-muted); }
.hud__v { font-size: var(--fs-h4); font-weight: 500; font-variant-numeric: tabular-nums; }
.hud__v--accent { color: var(--accent); }
.hud__v--flame { color: var(--flame); }
.hud__v--bad { color: var(--bad-text); }
.hud__v--clock { font-size: var(--fs-h2); font-weight: 600; line-height: 1; } /* T+ clock, T/W, countdown */

/* Overlay: full-screen dim layer with a centred panel */
.overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--gutter);
  background: var(--scrim-80);
  -webkit-backdrop-filter: brightness(0.5);
  backdrop-filter: brightness(0.5);
  animation: fade-in 0.4s var(--ease-overlay) both;
}
.overlay__panel {
  width: min(100%, var(--measure-center));
  max-height: 100%;
  overflow: auto;
  padding: var(--sp-6);
  background: var(--surface-1);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-md);
}
.overlay__close { position: absolute; top: var(--sp-4); right: var(--sp-4); }

/* Hero scrims for text on top of the canvas or imagery */
.scrim-top { background: linear-gradient(180deg, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0) 95%); }
.scrim-bottom { background: linear-gradient(0deg, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0.55) 35%, rgba(0, 0, 0, 0.25) 70%, rgba(0, 0, 0, 0) 100%); }

/* Chrome: top bar and footer */
.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-5);
  padding: var(--sp-5) var(--gutter);
}
.nav__link {
  display: inline-flex;
  align-items: center;
  min-height: var(--target);
  min-width: var(--target);
  padding: 0 var(--sp-3);
  font-size: var(--fs-small);
  font-weight: 700;
  letter-spacing: var(--track-label);
  line-height: 1;
  text-transform: uppercase;
  text-decoration: none;
  color: var(--text-90);
}
.nav__link:hover, .nav__link[aria-current="page"] { color: var(--text); }
.nav__brand {
  font-family: var(--font-display);
  font-size: var(--fs-h4);
  font-weight: 700;
  letter-spacing: var(--track-label);
  text-transform: uppercase;
  text-decoration: none;
  color: var(--text);
}
.legal {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--sp-3) var(--sp-5);
  margin: 0;
  padding: var(--sp-3) var(--gutter) var(--sp-5);
  font-size: var(--fs-caption);
  letter-spacing: 0.02em;
  text-transform: none; /* sentences stay sentence case */
  color: var(--text-muted);
}
.legal a { color: var(--text-90); }

/* Motion: reveal on load, attract pulse for the idle screen */
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes reveal-up {
  from { opacity: 0; transform: translateY(40px); }
  to { opacity: 1; transform: none; }
}
@keyframes attract-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 181, 71, 0.45); }
  50% { box-shadow: 0 0 0 18px rgba(255, 181, 71, 0); }
}
.reveal { animation: reveal-up var(--dur-slow) ease-in-out both; }
.reveal--2 { animation-delay: 0.5s; }
.reveal--3 { animation-delay: 1s; }
.attract { animation: attract-pulse 2.4s var(--ease-ui) infinite; }

/* Exhibit mode: add class "kiosk" to <body> on the laptop and /rocket */
.kiosk {
  user-select: none;
  -webkit-user-select: none;
  overscroll-behavior: none;
  -webkit-touch-callout: none;
}

/* Phone rocket surface: full-screen black, one big status word */
.phone {
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-height: 100vh;
  min-height: 100dvh;
  padding: max(var(--sp-5), env(safe-area-inset-top)) var(--sp-5) max(var(--sp-5), env(safe-area-inset-bottom));
  background: var(--bg);
  text-align: center;
}
.phone__status { align-self: center; justify-self: center; }

/* Native <dialog> overlays (Imagine picture, sources panel): showModal() gives focus
   trapping, Escape and an inert background for free. See section 6.2. */
dialog.overlay {
  width: 100%;
  max-width: none;
  height: 100%;
  max-height: none;
  margin: 0;
  border: 0;
  color: var(--text);
}
dialog.overlay:not([open]) { display: none; }
dialog.overlay::backdrop { background: var(--scrim-80); }

/* Hit area: a visual control smaller than 48px (marker, glossary term, slider handle)
   still gets a 48x48 touch target. The host element must be position: relative. */
.hit { position: relative; }
.hit::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: max(100%, var(--target));
  height: max(100%, var(--target));
  transform: translate(-50%, -50%);
}

/* Segmented switch: Kid / Curious / Engineer, Rocket / Emissions. Buttons are 48px+. */
.seg {
  display: inline-flex;
  border: 2px solid var(--text);
  border-radius: var(--radius-sm);
  background: var(--panel-hud);
  overflow: hidden;
}
.seg > button {
  min-height: var(--target);
  min-width: var(--target);
  padding: 0 var(--sp-4);
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: var(--fs-small);
  font-weight: 600;
  letter-spacing: var(--track-label);
  text-transform: uppercase;
  cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease-ui), color var(--dur-fast) var(--ease-ui);
}
.seg > button + button { border-left: 2px solid var(--text); }
.seg > button:hover { background: var(--text); color: var(--accent-ink); }
.seg > button[aria-pressed="true"] { background: var(--accent); color: var(--accent-ink); }

/* Range slider (Explode, replay scrubber): 48px thumb, 8px track */
.range { display: flex; align-items: center; gap: var(--sp-4); }
.range input[type="range"] {
  flex: 1;
  height: var(--target);
  margin: 0;
  background: transparent;
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
}
.range input[type="range"]::-webkit-slider-runnable-track { height: 8px; border-radius: var(--radius-pill); background: var(--line-strong); }
.range input[type="range"]::-moz-range-track { height: 8px; border-radius: var(--radius-pill); background: var(--line-strong); }
.range input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: var(--target);
  height: var(--target);
  margin-top: -20px;
  border: 3px solid var(--accent-ink);
  border-radius: 50%;
  background: var(--accent);
}
.range input[type="range"]::-moz-range-thumb {
  width: var(--target);
  height: var(--target);
  box-sizing: border-box;
  border: 3px solid var(--accent-ink);
  border-radius: 50%;
  background: var(--accent);
}
.range__value { min-width: 4ch; font-family: var(--font-mono); font-size: var(--fs-body); text-align: right; font-variant-numeric: tabular-nums; }

/* Progress dots (six mission checkpoints): done / current / to come, plus a text label */
.steps { display: flex; gap: var(--sp-3); }
.step { width: 20px; height: 20px; border: 2px solid var(--text); border-radius: 50%; }
.step.is-done { background: var(--accent); border-color: var(--accent); }
.step.is-now { background: var(--text); box-shadow: 0 0 0 4px var(--accent-tint); }

/* Meter: steady meter, loading bar */
.meter { height: 16px; border: 2px solid var(--text); border-radius: var(--radius-pill); overflow: hidden; }
.meter__fill { width: var(--fill, 0%); height: 100%; background: var(--accent); transition: width var(--dur-fast) linear; }

/* SVG gauge (you vs target): class the SVG parts, never hard-code colours */
.gauge__track { fill: none; stroke: var(--line-strong); stroke-width: 10; stroke-linecap: round; }
.gauge__zone { fill: none; stroke: var(--ok); stroke-width: 10; stroke-linecap: round; }
.gauge__needle { stroke: var(--text); stroke-width: 4; stroke-linecap: round; }
.gauge--hit .gauge__zone { stroke: var(--accent); }

/* Emissions: stacked phase bar. Colour plus pattern plus a printed label per segment. */
.bar-stack { display: flex; height: 40px; border: 2px solid var(--text); border-radius: var(--radius-sm); overflow: hidden; }
.phase--1 { background: var(--phase-1); }
.phase--2 { background: repeating-linear-gradient(45deg, var(--phase-2) 0 6px, var(--bg) 6px 9px); }
.phase--3 { background: radial-gradient(circle, var(--bg) 30%, transparent 32%) 0 0 / 8px 8px, var(--phase-3); }
.range-bar { position: relative; height: 12px; border-radius: var(--radius-pill); background: var(--fill-1); }
.range-bar__span { position: absolute; top: 0; bottom: 0; left: var(--lo, 0%); right: calc(100% - var(--hi, 100%)); border-radius: var(--radius-pill); background: var(--line-strong); } /* low to high estimate; always also printed as words */
.range-bar__mid { position: absolute; top: -4px; bottom: -4px; left: var(--mid, 50%); width: 4px; background: var(--text); }

/* Caption bar (tour line, coach hint) and glossary term + popover */
.caption {
  padding: var(--sp-4) var(--sp-5);
  background: var(--panel-hud);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-sm);
  font-size: var(--fs-lead);
  line-height: 1.4;
  text-align: center;
}
.term {
  position: relative;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-decoration: underline dotted var(--accent);
  text-underline-offset: 0.25em;
  cursor: pointer;
}
.popover {
  position: absolute;
  z-index: var(--z-chrome);
  max-width: 20rem;
  padding: var(--sp-4);
  background: var(--panel);
  border: 2px solid var(--text);
  border-radius: var(--radius-md);
  font-size: var(--fs-body);
}

/* Slots over the canvas. The host (ViewerSlot) is position: relative and fills the viewport.
   Large screens: HUD bottom-left, card bottom-right, switch top-right, captions bottom-centre.
   720px and narrower: one bottom sheet at a time (see the priority table in section 7.1). */
.dock { position: absolute; z-index: var(--z-hud); max-width: calc(100% - 2 * var(--gutter)); }
.dock--tr { top: var(--sp-4); right: var(--gutter); }
.dock--bl { bottom: var(--sp-5); left: var(--gutter); }
.dock--br { bottom: var(--sp-5); right: var(--gutter); width: 26rem; }
.dock--bottom { bottom: var(--sp-5); left: 50%; width: min(48rem, calc(100% - 2 * var(--gutter))); transform: translateX(-50%); }
.sheet { max-height: 45vh; max-height: 45dvh; overflow: auto; overscroll-behavior: contain; }
.fit { max-width: 100%; height: auto; } /* images and QR: never wider than their panel */
@media (max-width: 720px) {
  .dock--bl, .dock--br { right: 0; bottom: 0; left: 0; width: auto; max-width: none; }
  .dock--bl > .hud, .dock--br > .card, .dock--br > .sheet { border-radius: var(--radius-md) var(--radius-md) 0 0; }
  .dock--bottom { bottom: auto; top: calc(var(--sp-4) + var(--target) + var(--sp-3)); }
}

/* Reduced motion: no pulses, no slides, no long fades. data-motion="reduce" is set on <html>
   by useReducedMotion() (section 6.1) so the CSS and the 3D scene agree. */
@media (prefers-reduced-motion: reduce) {
  .attract { box-shadow: 0 0 0 4px var(--accent-tint); } /* static ring instead of a pulse */
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    animation-delay: 0s !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* Forced colours (Windows high contrast): keep edges visible */
@media (forced-colors: active) {
  .btn, .card, .chip, .hud, .seg, .overlay__panel, .popover { border-color: CanvasText; }
}

/* Narrow screens (SpaceX breakpoint 961px): tighter padding, same 48px targets */
@media (max-width: 961px) {
  .btn { padding: 0 var(--sp-5); }
  .overlay__panel { padding: var(--sp-5); }
  .hud { padding: var(--sp-3) var(--sp-4); }
}
```

### Fallback and licence notes

* The `var(--nf-display, "Barlow Semi Condensed")` form means the page still renders in a close system fallback if `next/font` is ever removed. Arial Narrow and Arial are system fonts, not shipped files.
* Barlow, Barlow Semi Condensed and Roboto Mono are SIL OFL / Apache 2.0. Barlow Semi Condensed 500 to 700 is the stand-in for D-DIN-Bold; Barlow is the stand-in for D-DIN Regular.

## 6. Exhibit adjustments

| Rule | How |
|---|---|
| **Targets at least 48 x 48 px** | `--target: 48px` is both `min-height` and `min-width` of `.btn`, `.btn-icon`, `.nav__link`, `a.chip`, `button.chip`, each `.seg` button and the slider thumb. Primary actions use `.btn-lg` (64 px). Keep 16 px (`--sp-4`) between two targets. Anything visually smaller (glossary term, legal link, projected engine marker) gets `.hit` (a 48 x 48 invisible pad). |
| **Targets inside the 3D canvas** | Engines, parts and markers are chosen by a DOM overlay or by screen-space hit testing, not by the mesh alone. Engine markers (08) are `<button class="btn btn-icon hit">` elements projected with drei `<Html>`, so they are 48 px; mesh clicks stay as a bonus. Nine markers must not overlap: if their projected centres are closer than 56 px, the panel's own nine toggles (always 48 px) are the primary control. |
| **Walk-up type size** | Root 18 px (20 at 1500 px, 22 at 1920 px). Body is `1rem` = 18 to 22 px. HUD keys, chips, source badges, eyebrows and nav use `--fs-small` (15.75 px at base) or larger. `--fs-caption` (14.6 px) is only for the legal line and model credit. Clocks, T/W, countdowns and the checkpoint prompt use `.hud__v--clock` (`--fs-h2`, 34 to 54 px) or larger. Validate on the real exhibit screen at 1 m before Saturday night. |
| **Contrast** | All text at least 4.5:1 (table below). Readable text uses `--text` or `--text-muted` (8.9:1). `--text-dim` (6.6:1) is for decorative eyebrows only. Red words use `--bad-text`, never `--bad`. |
| **Text never sits on bare canvas** | Every piece of text or control lives on `.card`, `.hud`, `.sheet`, `.caption`, `.overlay__panel` or under a tested `.scrim-*` that covers the whole text block. These use `--panel` (`rgba(10,10,10,.94)`) or `--panel-hud` (`rgba(0,0,0,.88)`), which still give 7.7:1 or better over a pure-white rocket or a bright Imagine picture. Blur is decoration, not the contrast mechanism. `.btn-outline` and `.chip` are for use inside those panels only. |
| **Colour is never the only signal** | Status chips pair colour with a word (OK, WARN, OFF); engines show a word and an X as well as colour; the emissions bar pairs colour, a pattern and a printed label; "estimate" is a dashed chip with the word. |
| **Reduced motion** | One preference governs everything (section 6.1): CSS, `useFrame` animations, auto-rotate, flame flicker, camera sweeps and the attract loop. |
| **No keyboard needed** | Every action has a visible button. No hover-only UI (SPX's `.card:hover .button` pattern is NOT copied). Ask works with touch only (section 7). |
| **Selection and gestures** | `.kiosk` on `<body>` disables text selection, overscroll bounce and the long-press menu. Do not disable pinch-zoom in the viewport. |
| **Glare and distance** | Pure black ground, off-white text, one warm accent. No weights below 400. |

### 6.1 One reactive motion preference

Owner: Neel, `components/ui/useReducedMotion.ts`. Everything that animates reads this hook (or `getMotion()` outside React); nothing reads `matchMedia` itself.

```ts
// components/ui/useReducedMotion.ts
import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";
const mq = () => (typeof window === "undefined" ? null : window.matchMedia(QUERY));

export function getMotion(): "reduce" | "full" {
  return mq()?.matches ? "reduce" : "full";
}
function subscribe(cb: () => void) {
  const m = mq();
  m?.addEventListener("change", cb);
  return () => m?.removeEventListener("change", cb);
}
/** true when the visitor or the OS asked for less motion. Reactive. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => !!mq()?.matches, () => false);
}
/** Mirror the preference onto <html data-motion> so CSS can match. Call once in a client component in layout. */
export function useMotionAttribute() {
  const reduce = useReducedMotion();
  if (typeof document !== "undefined") document.documentElement.dataset.motion = reduce ? "reduce" : "full";
}
```

| Animation | Full motion | Reduced motion |
|---|---|---|
| Attract auto-rotate (03, 11 on disconnect, 12) | Slow orbit | Fixed, nicely framed pose; the "Touch to explore" button is still shown |
| Idle replay loop (12) | Plays the mission with camera moves | Static pose per event (cut, no sweep), narration still plays; no automatic camera flight |
| Visitor-started replay or guided mission (07) | Full | Plays (the visitor asked for it) but camera sweeps become cuts and flame flicker is a steady glow |
| Flame flicker (10, 08) | Flicker | Constant glow |
| Camera `flyTo` (03 tour) | Eased flight | Instant cut |
| Explode slider drag | Live | Live (direct manipulation is not decoration) |
| CSS reveal, pulse, transitions | As written | Neutralised by the CSS block |

### 6.2 Dialog behaviour (Imagine picture, sources panel, any overlay)

Use a native `<dialog class="overlay">` and `showModal()`. That gives focus containment, Escape to close and an inert background without custom code. Required on top of it:

1. Accessible name: `aria-labelledby` pointing at the panel's heading (Imagine: "Grok's picture of the <part>"; sources: "Where do these numbers come from?").
2. Move focus to the Close button (or the first control) on open; restore focus to the opener on close (`dialog.close()` then `opener.focus()`).
3. Close button: 48 px `.btn-icon`, always visible, plus Escape, plus a tap on the dim area outside the panel.
4. The kiosk idle reset (12) closes any open dialog.
5. Images get `alt` text from the prompt or caption and use `.fit`.

### Computed contrast (WCAG 2.x)

| Pair | Ratio | Use |
|---|---|---|
| `--text` `#F0F0FA` on `#000` | 18.55 | everything |
| `--text` on `--surface-3` `#1A1A1A` | 15.37 | solid cards |
| `--text` / muted on `--panel` over a **white** background | 15.53 / 8.15 | `.card` over a bright image |
| `--text` / muted on `--panel-hud` over **white** | 14.56 / 7.73 | `.hud`, `.btn`, `.seg` |
| `--text-90` on `#000` | 14.83 | nav links |
| `--text-muted` (.7) on `#000` | 8.89 | body secondary, labels |
| `--text-dim` (.6) on `#000` | 6.62 | decorative eyebrows |
| `--text` border (2 px) on `#000` | 18.55 | button borders (needs 3:1) |
| `--line-strong` (.5) on `#000` | 4.78 | slider track, range bar |
| `--line` (.35) on `#000` | 2.79 | decorative only |
| `--accent` `#FFB547` on `#000` / `#1A1A1A` / `--panel` over white | 11.95 / 9.91 / 10.01 | accent text, focus ring |
| `#000` on `--accent` | 11.95 | `.btn-accent`, pressed `.seg` button |
| `--accent-hover` `#FFD085` on `#000` | 14.61 | link hover |
| `--flame` `#FF6308` on `#000` | 7.04 | **large numbers only** (24 px+ bold). On a chip fill it is 4.48, so it is never used for small text |
| `--ok` / `--warn` / `--info` on a chip fill (`#1A1A1A` + 10% white) | 5.81 / 6.76 / above 8 | status chips |
| `--bad-text` `#FF8A8A` on a chip fill | 5.89 | red words, `.chip--bad`, `.hud__v--bad` |
| `--bad` `#EF4343` on a chip fill | 3.54 | **not for text**; icons and glows only (this was a fail in review) |
| QR: black on `--qr-paper` | 21.0 | pairing QR |

## 7. How each surface uses it

| Surface (plan) | Uses | Specifics |
|---|---|---|
| **Main page chrome (03)** | `.nav`, `.nav__brand` "TEARDOWN", `.nav__link`, `.container`, `.legal`, `.seg`, `.dock--br`, `.sheet`, `.card`, `.eyebrow`, `.stat`, `.btn-outline`, `.term`, `.popover`, `.caption` | Canvas fills the viewport on `--bg`; nav over it with `.scrim-top`. **Level switch:** one `.seg` with three buttons **Kid · Curious · Engineer** (`aria-pressed`, default Kid). **Part card:** `.card` in `.dock--br` (a `.sheet` at 720 px and narrower) with `.eyebrow` system name, `h3` part name, `.stat` rows, `.btn-outline` actions; glossary words are `.term` buttons (with `.hit`) opening a `.popover` with the one-line definition. **Explode:** `.range` (slider, label "Explode", percent in `.range__value`). **Tour:** Start/Stop `.btn`, current line in a `.caption` in `.dock--bottom`. |
| **Replay HUD (07 Tasks 1-4)** | `.hud` in `.dock--bl`, `.hud__v--clock`, `.btn`, `.range`, `.eyebrow`, `.btn-accent .btn-lg` | Mission name, date, "B1067 · flight 22", landing type as `.hud__row`s; **T+ mm:ss** in `.hud__v--clock`; Launch / Pause / Restart as `.btn` (Launch is `.btn-accent`); scrubber is a `.range` (0 to the last event time). Event list: past events at `--text-muted`, upcoming at `--text`, the current event has an accent left bar and `aria-current="step"`; dimming never goes below the muted colour. Source link is `a.chip`. Only values the mission JSON provides are shown: **no altitude or speed readouts**. |
| **Guided mission HUD (07 Tasks 5-8)** | `.display`, `.card`, `.gauge__*`, `.meter`, `.steps`, `.caption`, `.btn`, `.btn-accent .btn-lg` | *Waiting prompt:* the checkpoint prompt in `.display` (uppercase, 4 words or fewer) in `.dock--bottom` over a `.card`; a "how to hold it" picture (SVG using `--text` strokes: arrow up, tilted rocket, still rocket plus "HOLD", upside-down rocket, upright rocket). *You vs target:* SVG arc with `.gauge__track`, green `.gauge__zone` (`.gauge--hit` turns it accent when inside), `.gauge__needle`; for max-Q a `.meter` whose `--fill` follows `stillMs / STEADY_MS`. *Progress:* `.steps` with six dots (done / now / to come) plus sr-only "Step 3 of 6", the T+ clock (`.hud__v--clock`), booster line as `.eyebrow`. *Coach hint:* `.caption` under the prompt. *"Do it for me" (skip offer, shown after the coach offers it):* a `.btn` (not accent) at 64 px beside the prompt. *Start:* `.btn-accent .btn-lg` "Fly the mission". *End screen:* `.overlay` (non-dialog, no focus trap needed as it fills the stage) with big stars in `.display` (`--accent`; empty stars `--text-dim` with an outline so ★☆ reads without colour), the `reasons` lines as `.lead`, and a `.btn-accent .btn-lg` "Fly again" (also "Shake the rocket or tap"). Retry never needs a keyboard. |
| **Engine panel (08)** | `.card` in `.dock--bl`, nine `.btn.btn-icon.hit` toggles (`aria-pressed`), `.hud__v--clock`, `.chip` | Engines show "7 / 9" in `.hud__v--clock`; total thrust kN and T/W in `.stat`. **Running engine** marker/toggle: pressed state (accent) with a flame glow in `--flame` in the 3D scene; **out**: outline only with an X glyph and the word OFF, 3D marker `--bad` with an X. (Plan 08's "amber running" is read as: running = `--accent` / `--flame` family, out = `--bad`; the verdict pill is **yes = `.chip--ok`, barely = `.chip--warn`, no = `.chip--bad`**, each with its word.) T/W is 0 with `.hud__v--bad` "NO THRUST". |
| **/rocket phone page (10)** | `.phone`, `.display`, `.btn-accent .btn-lg`, `.chip`, `.attract`, `.card` | Full-screen `#000`, no nav, `.kiosk`. States, each one full-screen with one action: **Start** ("Tap to start your rocket", `.btn-accent .btn-lg`, requests motion permission); **Ready / Liftoff / Landed** (status word in `.display`, flame glyph in `--flame` that scales with thrust and holds steady under reduced motion); **Motion denied** (`.card`: "Motion is blocked. Open Settings, allow Motion and Orientation for this site, then tap Try again." plus `.btn-accent` "Try again"); **No sensors** (`.card`: "This phone can't feel motion. Try another phone." plus `.chip--bad` "NO SENSORS"); **Sound blocked** and **Wake lock failed** are `.chip--warn` rows with a one-line fix ("Turn off auto-lock"), the app keeps working; **Disconnected** (`.chip--bad` "OFFLINE", auto-retry text). A small "About" sheet holds the legal line. Safe-area padding is in `.phone`. |
| **Pairing QR (11)** | `.card--solid`, `.eyebrow`, `.lead`, `--qr-paper`, `.chip`, `.btn` | QR on a `--qr-paper` square with a 16 px quiet zone, `.fit`, at least 12 rem wide; "Scan with your phone" in `.lead`; connection `.chip`. **Zero control:** `.btn` "Zero" with the sentence "Stand the rocket up, then tap Zero" as `.small`. Re-shown automatically after 2 s with no frames. |
| **Voice / Ask (05)** | `.btn-icon .btn-lg`, `.btn-accent`, `.attract`, `.chip`, `.card` | "Ask the rocket" is a 64 px `.btn-accent`; listening state is `aria-pressed` with the word "Listening". **Kiosk without keyboard or mic:** the text box is hidden, and a `.card` shows **three to five example questions as `.btn-outline` buttons** (touch to ask; the list comes from `LINES`/the agent starters and is never empty). If the mic is denied the example buttons still work. Answer in a `.card` at `--fs-lead`; error is `.chip--bad` "Couldn't reach Grok". |
| **Imagine overlay (09)** | `<dialog class="overlay">`, `.overlay__panel`, `.overlay__close`, `.fit`, `.chip` | Behaviour per section 6.2. Dim is `brightness(.5)` (SPX `.overlay`) over `--scrim-80`. The picture sits inside `.overlay__panel` with its caption on a `.caption` under it (**not** over the image, because Imagine pictures can be white); `.chip` "AI image". Loading: text "Making your picture" and a `.meter` (static fill under reduced motion). |
| **Emissions (13)** | `.seg` (LensSwitch), `.hud`, `.hud__v--clock`, `.bar-stack`, `.phase--*`, `.range-bar`, `.chip`, `a.chip`, `<dialog class="overlay">`, `.card` | **LensSwitch:** a `.seg` "Rocket · Emissions" in `.dock--tr`. **Counter:** "≈ 379 t CO₂" in `.hud__v--clock` with `.chip--est` "estimated". **Phase bar:** `.bar-stack` with `.phase--1/2/3` (stage 1, stage 2, landing burns) each labelled in text under the segment. **Uncertainty:** value in words "≈ 3 t (0.4 to 17 t)" and a `.range-bar` with `--lo`, `--hi`, `--mid`; the words are authoritative. **Source badges:** `a.chip` per value, with type shown as word and style: `.chip--ok` "Official", `.chip--info` "Peer-reviewed", `.chip--est` plus `.chip--warn` "Estimate". The `SourcesPanel` is a dialog per 6.2. **End summary:** a "Flight emissions" trigger above the stars overlay opens a native dialog with total CO₂, comparisons, soot note and the honest-scale line; no colour-only meaning. |
| **Kiosk attract loop (12)** | `.kiosk`, `.display--sentence`, `.reveal`, `.attract`, `.btn-accent .btn-lg` | Idle screen: orbiting rocket (a fixed pose under reduced motion, section 6.1), the motto "Bringing rocket science down to Earth." in `.display--sentence`, `.reveal` stagger (0 / .5 s / 1 s as on SPX), one `.btn-accent .btn-lg` "Touch to explore" with `.attract` (static ring under reduced motion). The idle reset closes dialogs, resets the lens and level. |

### 7.1 Slots and collisions (375 px, 720 px, exhibit)

Parent: `ViewerSlot` is `position: relative; height: 100dvh`. Children use `.dock--*`.

| Slot | Exhibit (above 720 px) | 720 px and narrower (phone, small tablet) |
|---|---|---|
| Nav / title | top, full width | top, brand plus menu only |
| LensSwitch (`.seg`) | `.dock--tr` | `.dock--tr`, shrinks to icon-only text "Rocket / CO₂" with both buttons 48 px |
| Part card, engine panel, replay HUD, mission HUD | HUD and engine panel `.dock--bl`; part card `.dock--br` (26 rem) | **One** bottom sheet at a time, full width, `max-height: 45dvh`, scrolls inside |
| Captions (tour, coach) | tour caption in the part card through 1280 px; guided coach inside the mission sheet | inside the active card/sheet, never a separate dock under the header |
| Voice / Ask | one right-column disclosure below the lens switch; its expanded contents scroll inside | same disclosure; emissions HUD yields while Ask is expanded |
| Emissions HUD | below the lens switch and collapsed Ask row | compact, internally scrolling band above the bottom sheet; hides while Ask is expanded |
| Pairing QR | centre card when no rocket is linked | centre card, `.fit` |

The mode owns the bottom content: idle explorer rail (including the flight/engine launch buttons), selected-part card, open engine sheet, replay sheet, guided progress/prompt sheet, or mission-end overlay. 03 hides explorer controls in flight modes; 07 portals idle launch buttons into 03's rail; 08 hides the rail/card while its sheet is open. Native dialogs sit above these surfaces. The Ask disclosure temporarily hides the emissions HUD while expanded. At 375 px the page stays fixed; active sheets, disclosure contents and dialogs scroll internally. These integration rules still require browser verification at the sizes above.

## 8. Rules

1. **No SpaceX or xAI logos, wordmarks, photos, videos or font files.** No D-DIN, no `xVf`, no copied CSS blocks. We use measured numbers only.
2. **Footer on every screen with chrome:** "Student project. Not affiliated with SpaceX or xAI." and the model credit "Falcon 9 - SpaceX by Stanley Creative, CC BY 4.0".
3. **Our name is "Teardown"** (nav brand is plain text in `--font-display`; no logo image).
4. **Tokens only.** Components outside `app/globals.css` use `var(--...)` tokens and never hard-code a hex value. New tokens go through this spec.
5. **Accent discipline:** `--accent` marks the single next action, pressed state and earned stars; `--flame` marks fire, thrust and emissions as big numbers; status colours always come with a word.
6. **Uppercase is for headings, labels and status words (four words or fewer).** Sentences (the motto, the legal line, captions, answers) stay sentence case. Use `.display--sentence` for a big sentence.
7. **No hover-only controls**, no text below `--fs-small` (except legal and credits), no target below 48 x 48 px.
8. **Lane ownership:** Neel edits `app/layout.tsx`, `app/globals.css` and `components/ui/useReducedMotion.ts`. Anders puts surface-specific CSS in his own folders as CSS Modules that only reference tokens and use the classes above.
9. **Where this spec overrides a plan:** buttons follow plan 03 (2 px opaque border, invert on hover); the Kid · Curious · Engineer switch follows plan 03; "amber" engine colours follow section 7 (Engine panel); the footer wording follows section 3. Where this spec overrides SpaceX's measured values (1 px translucent button border, 12 px label sizes, 50% muted text) it is for exhibit legibility.

## 9. Verification checklist (for the implementer)

- [ ] `npm run build` passes; the Network tab shows fonts served from `/_next/static/media` only.
- [ ] Lighthouse accessibility 100 on `/` and `/rocket`; no contrast warnings.
- [ ] DevTools: every `.btn`, `.nav__link`, `a.chip` computed height at least 48 px.
- [ ] Toggle "Emulate prefers-reduced-motion": no pulse, no slide-in, no auto-rotate, no flame flicker, tour cuts instead of flights.
- [ ] Open the Imagine dialog: focus moves in, Tab stays inside, Escape closes, focus returns to the opener.
- [ ] Put a white image behind a `.card`, `.hud` and `.btn`: text is still readable.
- [ ] At 375, 720 and 1920 px wide: no two slots overlap, only `.sheet` scrolls.
- [ ] At 1280x720 and 1920x1080 the part card and HUD text are readable from 1 m.
- [ ] `grep -ri "d-din\|xvf\|spacex.com/\|x.ai/" app components public` finds no asset references.
