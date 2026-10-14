# Competitor report: Fractal Dive (Ronald Kuiper / Newlin)

Prepared 2026-10-13 for Fractal Atlas (free, no IAP, no tracking; 1.18.2 live, 1.18.3–1.19.0 queued).
Research by an agent; the identity, version, dates, price, $1.99 Pro IAP, ratings,
genres, size, languages, minimum OS and the 10^331 claim's wording were
re-checked against the live listing and iTunes lookup on 2026-10-13. Since
then, 1.20.0 shipped the map-legend info card mentioned in recommendation 2.

## Sources fetched

| Ref | URL | What it gave |
|---|---|---|
| [L] | https://apps.apple.com/us/app/fractal-dive/id6813485724 | Live US listing (subtitle, promo text, description, version history, privacy, IAP, compatibility, languages) |
| [J] | https://itunes.apple.com/lookup?id=6813485724&country=us | iTunes Lookup JSON (dates, size, genres, bundle ID, ratings, screenshot URLs, supported devices) |
| [D] | https://itunes.apple.com/lookup?id=1889163344&entity=software&country=us | Developer's catalogue (one app) |
| [S] | Screenshot images from the `screenshotUrls` in [J] (is1-ssl.mzstatic.com, 8 iPhone 16 Pro Max images) | Screenshot content, viewed directly |
| [W] | https://newlin.nl/fractal-dive | Product page (Dutch) |
| [P] | https://newlin.nl/fractal-dive/privacy | Privacy policy (Dutch, dated 18 Sep 2026) |
| [N] | https://newlin.nl/ and https://newlin.nl/over.html | Newlin agency home and About page |
| [R] | https://itunes.apple.com/us/rss/{topfreeapplications,toppaidapplications}/limit=200/genre={6016,6027}/json | US top charts, Entertainment and Graphics & Design (feed returns 100 entries) |
| [A] | https://apps.apple.com/us/app/fractal-atlas/id6816481394 and https://itunes.apple.com/lookup?id=6816481394&country=us | Our own live listing, for comparison |
| Repo | `CHANGELOG.md`, `TODO.md`, `docs/learn-more-links.md`, `app.js`, `colormaps.js`, `shaders.js` | What Fractal Atlas has and plans |

Wayback Machine has no snapshot of the listing (checked `archive.org/wayback/available` and the CDX API), so pre-1.2 listing details could not be recovered.

## 0. Identity: confirmed

The screenshot's app is **Fractal Dive**, id6813485724.
- The developer and seller are "Ronald Kuiper", artist id 1889163344 [J][L].
- The version is 1.2, released 2026-10-12T18:47:10Z ("1d ago" on 2026-10-13) [J][L].
- The 1.2 release notes on the live listing match the user's screenshot word for word, all eight bullets [L][J].
- The developer has published only this app [D].
- The bundle ID is `nl.newlin.fractal-dive` and the copyright line is "© 2026 Newlin" [J][L].

## 1. Listing facts

| Field | Value | Source |
|---|---|---|
| Name | Fractal Dive | [L] |
| Subtitle | "Zoom into fractals forever" | [L] |
| Promotional text | "Most fractal apps stall around a thousand trillion times magnification. This one keeps going — past a 1 with three hundred zeros after it." | [L] |
| Price | Free, with In-App Purchases | [L][J] |
| In-App Purchases | **One:** "Fractal Dive Pro" at **$1.99**. The description says it's a one-time purchase ("No subscription. Buy once for iPhone, iPad and Mac together, Family Sharing included"). | [L] |
| Earlier price model | 1.0 was **paid**. The 1.1 notes say "Fractal Dive is now free. Endless zooming stays free; anyone who bought the app before has Pro automatically." The 1.0 price is **unverified**. | [L] |
| Rating | No ratings: `userRatingCount` 0, and the listing shows "hasn't received enough ratings". | [J][L] |
| Chart ranks | The listing shows no chart badge. The app is not in the US top 100 (free or paid) for Entertainment or Graphics & Design (feeds checked 2026-10-13). | [L][R] |
| Category | Primary Entertainment, secondary Graphics & Design (the opposite of ours) | [J] |
| Size | 2.7 MB (2,696,192 bytes); ours is 8.9 MB | [J][L][A] |
| Languages | English, Dutch, French, German, Italian, Spanish | [L][J] |
| Age rating | 4+ | [L] |
| Privacy label | "Data Not Collected" | [L] |
| Accessibility labels | "The developer has not yet indicated…" (the same as ours) | [L][A] |
| Platforms | Universal iPhone/iPad app (iOS/iPadOS 17+). Native **Mac** listing ("MacDesktop" device; macOS 14+). Apple Vision compatibility listed (visionOS 1.0+). | [L][J] |
| Our platforms, for contrast | iOS 15+. Mac shows "Designed for iPad. Not verified for macOS" (M1+). No Vision line. | [A] |
| First release | 2026-09-20 (1.0) | [J][L] |
| Version history | 1.0 on Sep 20, 1.1 on Oct 3, 1.2 on Oct 12: **three releases in 22 days**, roughly one every 10–13 days, and each one large. | [L] |
| App preview video | None (none in our listing either) | [L][A] |
| Game Center / ads | No Game Center. The description says no account, no ads, no subscription. | [J][L] |
| "You Might Also Like" | **Fractal Atlas is the first suggestion on their page, and Fractal Dive is the first on ours.** Apple treats the two as direct neighbours. | [L][A] |

### Description structure and keywords [L]

The description opens with a two-sentence explanation of what a fractal is. Then come eight ALL-CAPS headed sections:

1. **PINCH, AND KEEP PINCHING**: argues that most apps stall at about 10^15 because of float precision. Explains perturbation (an arbitrary-precision orbit on the CPU, differences on the GPU) and claims "tested to four times ten to the power 331".
2. **PRESS DIVE**: automatic travel to "the richest part of the shape… for minutes if you like".
3. **MADE TO LOOK AT**: nine colour schemes (three free), three colouring methods (step count, distance to edge, orbit trap), colouring that "reweighs itself at every depth", and save/share of pictures and place links.
4. **THREE FAMILIES**: Mandelbrot, the cubic version, and "a mirrored variant with sharp points instead of bulbs" (that is, Tricorn/Mandelbar; inferred from the wording), "all three go equally deep".
5. **NO MATHS REQUIRED**: 12 named places with one-line explanations, plus scale comparisons ("like a microscope… smaller than an atom"). Our own description also uses a "No maths required" heading (`TODO.md` line 8), so the two read alike here.
6. **ON ALL YOUR DEVICES**: iPhone, iPad and Mac. On Mac it supports keyboard, scroll wheel and trackpad.
7. **PRO, IF YOU WANT IT**: the full list of what Pro adds (below).
8. **HONEST**: no account, no ads, no subscription, collects nothing.

**Keyword themes:** fractal, zoom, dive, deep, Mandelbrot, Burning Ship, Julia, 4K/8K, wallpaper, print, video, iPhone/iPad/Mac. Absent: Sierpinski, Koch, fern, Newton, dragon curve, rotation, and education or Wikipedia framing.

### Free vs Pro split [L]

- **Free:** unlimited deep zoom, Dive, three colour schemes, step-count colouring, three formula families, 12 named places, scale comparisons, saving and sharing pictures (free resolution not stated, **unverified**), and share-a-place links (1.2 notes say "Free").
- **Pro ($1.99, one-time):** pictures in 4K and 8K, dive video rendered afterwards in 1080p or 4K, all nine colour schemes, the Edges and Trap colouring styles, saved places with name and thumbnail, Burning Ship, and the Julia set of any place.

## 2. Screenshots [S][J]

There are 8 iPhone (16 Pro Max) and 8 iPad (13" M5) screenshots, with the same set and order on both. Every one is a **raw, full-bleed in-app capture with no marketing caption, device frame or overlay text**. The only words are the app's own zoom card, which works as a caption: a large "N ×" plus a plain-language scale line. All eight use the **Aurora** palette, a saturated pink/violet/blue rainbow, and show the same bottom bar: a palette strip (Aurora, Fire, Ocean, Sunset, Gold…) and five buttons (Explore, Dive, Home, Share, More). The source filenames are Dutch.

| # | File name (Dutch → English) | Shows | Zoom card text |
|---|---|---|---|
| 1 | 01_zeepaardjes (seahorses) | Seahorse Valley spirals | "197 ×" / "like looking through a magnifying glass" |
| 2 | 02_spiralen (spirals) | Diagonal spiral filament with a mini-set | "101.098 ×" / "like a microscope" |
| 3 | 03_scheepje (little ship) | Burning Ship "armada" towers, distance-style glow (a **Pro** shape) | "445 ×" / "like looking through a magnifying glass" |
| 4 | 04_duik (dive) | Deep dendrite field, pink/black | "2,1 × 10²³ ×" / "smaller than an atomic nucleus" |
| 5 | 05_geheel (whole) | The whole Mandelbrot set | "1 ×" / "the whole picture" |
| 6 | 06_randen (edges) | Looks identical to #1 to the eye (same seahorse view at 197×). Probably an upload mistake; the file name suggests it was meant to show the Edges colouring style. Visual check only. | "197 ×" |
| 7 | 07_diep30 (deep 30) | Dendrite on a red-to-blue gradient | "3,9 × 10³⁰ ×" / "smaller than an atomic nucleus" |
| 8 | 08_diep100 (deep 100) | Small dendrite on a pink field | "5,4 × 10¹⁰⁰ ×" / "an atom blown up to the size of the solar system" |

**Observations**
- The set leads with beauty at shallow zoom (#1–3) and then proves depth with a climbing number: 10²³, then 10³⁰, then 10¹⁰⁰. The depth claim is the story.
- The English screenshots use Dutch number formatting ("101.098 ×" where US style is 101,098, and "2,1 × 10²³"). This is minor unpolish.
- The deep shots (#7 and #8) are visually thin, mostly flat gradient with a small dendrite. The number is what sells them.
- For comparison, our 6 screenshots are also uncaptioned. Ours lead with the picker grid, and the second one (`hsv-seahorse`) uses the HSV colormap removed in 1.18.0 [A].

## 3. The developer

- **Ronald Kuiper**, trading as **Newlin** in Zwolle, Netherlands. Newlin is a one-person app agency: "Newlin is het bureau van Ronald Kuiper: app developer met ruim vijftien jaar ervaring" [N]. It sells client app development, app audits, two-week prototype sprints and maintenance. It claims work on the NS travel app, Vattenfall's energy app, funda, and DPG Media's news apps (Trouw, de Volkskrant). Its stack is SwiftUI, Jetpack Compose and Kotlin/Java backends [N].
- **Prior fractal or graphics work:** none found. Fractal Dive is his only App Store app [D]. This looks like a seasoned commercial mobile dev's first indie or product app, not a graphics specialist. Still, the perturbation engine, the 10^331 claim and the fast cadence show real capability.
- **Product site** [W]: Dutch only, with an in-browser WebGL **preview** that "stops around a million times magnification — exactly where the app starts". It's out of date: it says "De app is Nederlandstalig" (the app is in Dutch) and that "the app makes no connection to the internet", both overtaken by 1.1/1.2. Support is by email.
- **Privacy policy** [P]: stores only on-device settings (welcome screen seen, colour and quality choice), with no analytics. It is dated 18 Sep 2026 and predates the IAP.
- No press coverage or social presence turned up in web search.

## 4. Feature comparison

"Them" means Fractal Dive 1.2 per [L]. "Us" means Fractal Atlas, live 1.18.2 plus the queued 1.18.3–1.19.0, per `CHANGELOG.md`/`TODO.md`/`app.js`.

| Feature | Them (Free / Pro) | Us | Notes |
|---|---|---|---|
| Deep zoom depth | Free. Claims "tested to 4×10³³¹" with an arbitrary-precision reference orbit | ~1e13 on the Mandelbrot family (float64 reference orbit; `TODO.md` "Later"). Carpet/gasket ~1e15 in the queued build | **They win by ~318 orders of magnitude.** Their promo text targets apps like ours ("stall around a thousand trillion"). Their depth figure is their claim, **unverified** by us. |
| Escape-time fractal types | Free: Mandelbrot, cubic, mirrored (Tricorn-like). Pro: Burning Ship, Julia of any place. 5 in total | 13 escape-time entries: Mandelbrot, Burning Ship, Tricorn, Celtic, Multibrot³, Phoenix, 3 Julia presets, Julia:Phoenix, Newton, Sierpinski carpet, Sierpinski gasket | **We win on breadth**, and all of ours are free. |
| Other fractals / patterns | None | 10: Koch, Pythagoras tree, Dragon, Hilbert, Gosper, Arrowhead, Barnsley fern, Sierpinski triangle (chaos game), Lévy C, Vicsek. 23 in all | Unique to us. |
| Colormaps | 9 schemes, 3 free and 9 in Pro (named: Aurora, Fire, Ocean, Sunset, Gold, Emerald, Ink, Coral; one unseen) | 12, all free (Inferno, Classic, Fire, Hot, Ember, Plasma, Viridis, Turbo, Glacier, Twilight, Spectrum, Grayscale) | We have more, and all free. |
| Colouring styles | Step count (free), Edges/distance and Trap/orbit trap (Pro). Colouring "reweighs itself at every depth" | One (smooth escape-time). Distance estimation and orbit traps are planned in `TODO.md` "Next" | **They're ahead.** Their auto-rescaling at depth also fixes the "flat wash" problem; we rejected automatic log compression (`TODO.md` "Explicitly rejected"). |
| Share links | Free (new in 1.2), "same colours and all" | Since 1.0. Universal links open the app (1.13.0), named colormap in the link (1.18.1), web fallback | **We're ahead**: our links also open on any browser without an install. Theirs need the app (no web viewer beyond the 1e6 preview; how their links resolve is **unverified**). |
| Saved places | Pro: name and thumbnail | None. Only in-memory per-fractal recall (1.17.0); bookmarks planned (`TODO.md` "Next") | They're ahead, but paywalled. |
| Auto-dive | Free "Dive", with a smoother planned path in 1.2 and "for minutes" | None. Planned (`TODO.md` "Next"), capped by ~1e13 | **Their hook.** Our depth cap limits how long a dive could run. |
| Video export | Pro: "every dive is recorded", rendered afterwards in 1080p/4K | None | They're ahead. |
| Image export | Free (resolution unstated). Pro: 4K and 8K. Share sheet with size and file type (1.1) | Canvas resolution, DPR capped at 2 (`app.js:537`). Watermark always on. Save to Photos and share sheet | They're ahead on resolution. Our high-res export is parked under "Paid tier" in `TODO.md`. |
| Rotation | Not mentioned anywhere (**unverified**) | Two-finger twist on every mode, compass (1.11.0), Shift+arrow keys | Likely ours alone. |
| Dual Julia view | "Julia set of any place" (Pro). Whether it's side by side is **unverified** | Free split view: Julia follows the main pane's center with a crosshair (1.12.0) | Ours is free and live-linked. |
| Place names / Surprise me | 12 named places with one-line explanations, plus scale comparisons ("like a microscope", "smaller than an atomic nucleus") | Surprise me: 6 Mandelbrot places (`app.js` `TELEPORT_DESTINATIONS`), place name in the info card. No explanations or scale comparisons yet. More planned (`TODO.md` "Next") | **They're ahead on beginner framing.** The scale comparisons in their screenshots act as captions. |
| Learn more / education | None | Wikipedia links planned, with all 23 verified (`docs/learn-more-links.md`) | Would be unique to us. |
| Mac | Native Mac listing; keyboard, scroll wheel, trackpad; "Save As…" fixed in 1.2 | iPad app on Mac, "Not verified for macOS". The web version has keyboard navigation (1.4.0) | They're ahead in the App Store. Our web app is a cross-platform plus. |
| iPad | Universal; iPad screenshots | Universal; iPad screenshots; Stage Manager untested (`TODO.md`) | About equal. |
| Vision Pro | Compatible (visionOS 1.0+) | Not listed | Minor. |
| Web version | Dutch-only preview, stops at ~1e6 [W] | Full app on GitHub Pages (PWA) | **Ours**, and a reach channel they don't have. |
| Accessibility (Larger Text) | Nothing declared or mentioned | Follows Larger Text through the accessibility sizes (1.15.0). Not declared on the listing [A] | Ours in the product, but neither declares it. |
| Localization | 6 languages | English only | **They're ahead**: more search storefront surface. |
| Performance claims | "Faster on every device: the kernel skips the inside of the set and sharpens only where it matters" | Cardioid/period-2 bulb skip (`shaders.js:329`), supersampling, last-frame-while-dragging | Both have a bulb skip. "Sharpens only where it matters" suggests adaptive refinement, which we lack (**unverified** how theirs works). |
| Minimum OS / size | iOS 17, 2.7 MB | iOS 15, 8.9 MB | We run on older devices. They're smaller (native, not a WebView). |
| Price / privacy | Free + $1.99 Pro. Data Not Collected | Free, nothing to buy. Data Not Collected | "Everything free" is our honest edge. |
| Ratings | 0 | 2 ratings, 5.0 [A] | Both are tiny. |

## 5. Assessment

### Where they're ahead
1. **Depth and the story built on it.** 10³³¹ vs our 10¹³. Their subtitle ("forever"), promo text, screenshots (10²³ → 10³⁰ → 10¹⁰⁰) and description all sell that one claim, and it directly calls out apps that stop at ~10¹⁵.
2. **Guided experience.** Dive (auto-zoom) plus dive video plus named places with explanations plus "smaller than an atom" scale comparisons. A beginner always has something to do.
3. **Distribution polish and cadence.** Six languages, a native Mac app, Vision compatibility, and three substantial releases in 22 days. The developer is a professional mobile engineer.
4. Colouring styles (distance, trap), high-res stills and video, and saved places, though most of these are behind Pro.

### Where we're ahead
1. **Breadth.** 23 fractals and patterns vs 5 (3 of them free). Newton, Phoenix, Celtic, Multibrot, the Sierpinski family, L-system curves and IFS. "Atlas" against "Dive" is a real positioning split.
2. **Everything is free, including what they charge for:** all 12 colormaps, Burning Ship, the Julia/dual view, rotation, and share links that work in a browser without an install.
3. **Exploration tools they don't advertise:** two-finger rotation with a compass, a live dual Julia view, keyboard navigation, a full web/PWA version, Larger Text support, and iOS 15 support.

### What they'll likely ship next (speculation, not sourced)
- More Pro shapes. Their families are "the same rule with tweaks" (Multibrot, Tricorn, Ship, Julia), so Celtic, Buffalo or Perpendicular variants are cheap for them.
- More named places and colour schemes, and more colouring options.
- Possibly iCloud sync of saved places, widgets or wallpaper framing (their copy already says "sharp enough for a wallpaper or a print").
- An English product page or support site, since the Dutch one is stale.
- Their pace (about every 10 days) suggests 1.3 before the end of October.

## 6. Recommendations for Fractal Atlas (prioritized)

1. **Fix the listing before adding features: localize it, declare accessibility, and redo the screenshots.** This is the cheapest reach.
   - Add App Store metadata localizations (name/subtitle/keywords/description) for at least Spanish, French, German and Dutch. Metadata can be localized before the app UI is, and each locale indexes keywords in more storefronts. They already have this and we don't.
   - Declare the Accessibility Nutrition Labels we can honestly support (Larger Text for sure; check the others). Neither app declares any today, so it's a free differentiator in search filters.
   - Replace the stale HSV screenshot with captioned screenshots that lead with breadth, something they can't match. For example, "23 fractals, all free", the picker grid, the dual Julia view, "Twist to rotate", the Sierpinski/fern patterns, and one deep Seahorse shot showing the "trillion times" card.
   - Since Apple lists the two apps as each other's top "You Might Also Like", a better icon, subtitle and first screenshot win that shared traffic directly.

2. **Position as the Atlas: breadth and learning, not depth.**
   - Don't fight on "forever". Our ~10¹³ is honest and the TODO already says "forever" isn't defensible.
   - Lean into what they don't have: many fractal families, short "what you're looking at" blurbs, and the verified Wikipedia Learn-more links (`docs/learn-more-links.md` is ready).
   - Add plain-language scale comparisons to the info card, which is already planned as the map-legend card: "about 1.8 trillion times: smaller than an atom". They proved it works as a screenshot caption, and our card already reads "1.8 trillion times" (1.18.8).
   - Extend Surprise me to the other escape-time fractals with one-line explanations (`TODO.md` "Next").

3. **Give away for free what they put behind Pro.** Pick the cheapest items:
   - **Saved places**, local only, reusing the share-link format as the stored view (`TODO.md` "Next").
   - **High-res image export**, e.g. 4K stills for wallpapers. Today it's parked under "Paid tier", but with no monetization it's better framed as "free where others charge". It pairs with the planned "Save to Photos, then set as your wallpaper" listing hook.
   - Then **distance-estimation colouring** (already in `TODO.md` "Next"). It also feeds item 4.
   - "Everything free, nothing to buy" then becomes a concrete line in the listing.

4. **A modest auto-dive or "fly-through", sized to our depth.** Dive is the hook for both competitors. A version that flies into a curated or distance-estimated target and stops gracefully at our ~1e13 limit (or loops back out, a zoom-in/zoom-out "breathe") is enough for a demo, and an app preview video built on it fills the gap both listings share. Don't start the arbitrary-precision engine just to match 10³³¹ unless depth becomes the product's message.

5. **Use the web version as the reach channel they don't have.** Add Open Graph/Twitter card tags so shared links unfurl with an image (`TODO.md` "Next", "best marketing per hour"). Their links need the app installed; ours open anywhere and now show the Smart App Banner (1.18.4).

## Unverified items

- Fractal Dive 1.0's price. The app was paid before 1.1 (per the 1.1 notes), but the amount isn't public now and there's no Wayback snapshot.
- Chart ranks outside the US top 100 for Entertainment and Graphics & Design. None is shown on the listing.
- Downloads and revenue: no public source.
- The 4×10³³¹ depth: the developer's own claim, not tested by us.
- Whether Fractal Dive supports rotation or a side-by-side Julia view: not mentioned on the listing.
- The resolution of free image exports: not stated.
- How their share links resolve without the app (universal link vs custom scheme): not stated.
- How "sharpens only where it matters" works (adaptive refinement is a guess).
- Whether the Mac app is SwiftUI multiplatform or Catalyst. The native Mac listing itself is verified.
- "iPhone Duo": quoted from their release notes; device not checked.
- That screenshot #6 duplicates #1: based on visual inspection only.
- The ninth colour scheme name: only 8 were seen (5 in the screenshots and 3 in the 1.1 notes).
- What they'll ship next (section 5): speculation.
