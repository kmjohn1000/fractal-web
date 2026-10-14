# Learn more links

Wikipedia article for each fractal and pattern, for the planned "Learn more"
link in the info card (see TODO.md). This file is the source of truth for
those links: when the feature is built, its per-fractal `wiki` values come
from here, and any change to a link goes here first.

**Maintenance:** adding, renaming or removing a fractal (`FRACTAL_CONFIGS`)
or pattern mode (`EXTRA_MODES`) in `app.js` means updating this table in the
same commit. The Key column is the `FRACTAL_CONFIGS` key (share-link `f=`) or
the `EXTRA_MODES` key (share-link `m=`), so rows stay matched to the code
even if display labels change.

Last verified: 2026-10-13 (all 23 entries; see "Verifying" below).

## Links

Match: **Article** = the fractal's own article, **Section** = a section of a
broader article, **None** = no suitable article, hide the link.

### Fractals (`FRACTAL_CONFIGS`)

| Key | App label | Link | Match | Notes |
|---|---|---|---|---|
| `Mandelbrot` | Mandelbrot | https://en.wikipedia.org/wiki/Mandelbrot_set | Article | |
| `Burn. Ship` | Burning Ship | https://en.wikipedia.org/wiki/Burning_Ship_fractal | Article | |
| `Tricorn` | Tricorn | https://en.wikipedia.org/wiki/Tricorn_(mathematics) | Article | Needs `_(mathematics)`: plain `Tricorn` goes to the hat |
| `Celtic` | Celtic Mandelbrot | — | None | No article; see open decisions |
| `Multibrot³` | Multibrot³ | https://en.wikipedia.org/wiki/Multibrot_set | Article | Power 3 is under its "Positive powers" section |
| `Phoenix` | Phoenix | — | None | No article |
| `Julia:Rabbit` | Douady rabbit | https://en.wikipedia.org/wiki/Douady_rabbit | Article | |
| `Julia:Dragon` | Dragon | https://en.wikipedia.org/wiki/Julia_set#Quadratic_polynomials | Section | Gallery shows c = −0.4 + 0.6i, the preset's exact c; Wikipedia doesn't call it "Dragon" |
| `Julia:Spiral` | Spiral | https://en.wikipedia.org/wiki/Julia_set#Quadratic_polynomials | Section | Gallery shows c = 0.285 + 0.01i, the preset's exact c |
| `Julia:Phoenix` | Phoenix | — | None | No article |
| `Newton z³` | Newton's method | https://en.wikipedia.org/wiki/Newton_fractal | Article | |
| `Carpet` | Sierpinski carpet | https://en.wikipedia.org/wiki/Sierpi%C5%84ski_carpet | Article | |
| `Gasket` | Sierpinski gasket | https://en.wikipedia.org/wiki/Sierpi%C5%84ski_triangle | Article | "Sierpiński gasket" redirects here |

### Pattern modes (`EXTRA_MODES`)

| Key | App label | Link | Match | Notes |
|---|---|---|---|---|
| `koch` | Koch snowflake | https://en.wikipedia.org/wiki/Koch_snowflake | Article | |
| `tree` | Pythagoras tree | https://en.wikipedia.org/wiki/Pythagoras_tree_(fractal) | Article | Needs `_(fractal)`: plain `Pythagoras_tree` is a disambiguation page |
| `dragon` | Dragon curve | https://en.wikipedia.org/wiki/Dragon_curve | Article | App draws the Heighway dragon; `#Heighway_dragon` also exists |
| `hilbert` | Hilbert curve | https://en.wikipedia.org/wiki/Hilbert_curve | Article | |
| `gosper` | Gosper curve | https://en.wikipedia.org/wiki/Gosper_curve | Article | |
| `arrowhead` | Sierpinski arrowhead | https://en.wikipedia.org/wiki/Sierpi%C5%84ski_curve#Arrowhead_curve | Section | |
| `fern` | Barnsley fern | https://en.wikipedia.org/wiki/Barnsley_fern | Article | |
| `sierpinski` | Sierpinski triangle | https://en.wikipedia.org/wiki/Sierpi%C5%84ski_triangle#Chaos_game | Section | Matches how the app draws it (chaos game) |
| `levy` | Lévy C curve | https://en.wikipedia.org/wiki/L%C3%A9vy_C_curve | Article | |
| `vicsek` | Vicsek fractal | https://en.wikipedia.org/wiki/Vicsek_fractal | Article | App draws the cross form, which the article covers |

Keep accented titles percent-encoded (`Sierpi%C5%84ski`, `L%C3%A9vy`) so
they survive URL handling in the app.

## Open decisions

1. **Celtic and both Phoenix entries:** hide the link (current choice). The
   nearest fallback for Celtic is
   https://en.wikipedia.org/wiki/Mandelbrot_set#Other_non-analytic_mappings,
   which covers Tricorn and Burning Ship but never mentions Celtic. Nothing
   found for Phoenix.
2. **Julia Dragon/Spiral:** both share one gallery section that shows their
   exact c values, without the app's names.
3. **Sierpinski arrowhead:** alternative target
   https://en.wikipedia.org/wiki/Sierpi%C5%84ski_triangle#Arrowhead_construction_of_Sierpi%C5%84ski_gasket
   would put three entries on the Sierpiński triangle article.
4. **Dragon curve:** whole article, or `#Heighway_dragon` to match the curve
   the app draws.

## Verifying

Check a link with Wikipedia's REST summary API: it must return 200, `type`
must be `standard` (not `disambiguation`), and the link should use the
returned `titles.canonical`:

```
http --ignore-stdin --body GET "https://en.wikipedia.org/api/rest_v1/page/summary/<Title>" User-Agent:'FractalAtlasLinkCheck/1.0'
```

For a `#section` link, also confirm the heading id exists in the page HTML:

```
http --ignore-stdin --body GET "https://en.wikipedia.org/api/rest_v1/page/html/<Title>" User-Agent:'FractalAtlasLinkCheck/1.0' | grep -o 'id="<Anchor>"'
```

Wikipedia rate-limits bursts (HTTP 429); space out checks of many pages.
