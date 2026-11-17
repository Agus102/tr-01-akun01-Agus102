# Token Radar — run notes

## What it is

`main.ts` at the root reads the sealed snapshot, scores every pre-token protocol with the model in
`lib/model.ts`, writes the ranked board to `/output/board.json`, writes the dashboard's data
(`data.js`) and a plain-text summary (`radar.md`), copies `dashboard/` and `screenshots/` into the
output, and writes `/output/dossier.json` with the vendored `vendor/makefun-board.ts`.

Run it outside the grader with:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input token-radar-01-kit/input/snapshot.json
```

## The watchlist

The brief defines the watchlist as a rule: a TVL floor, no token on record, and not a wrapped, staked
or bridged product of a token that already trades (no version marker, no whole word wrapped / staked /
staking, no bridge or staking category, no exchange's own name). `deriveWatchlist` in `lib/model.ts`
implements that rule over the ten fields the snapshot carries, and `auditWatchlist` reconciles it with
the snapshot's own `watchlist` list.

On this snapshot the rule derives **60** slugs and the snapshot names **40**. The rule as written also
excludes protocols DefiLlama records a `parentProtocol` for, and that field is not one of the ten the
snapshot carries, so the ten-field reading keeps 20 extra sub-protocols (Arcus Perps, Circle Gateway,
USDCx, …). The snapshot's own list is the gate's authority and the board covers it whole; the page
shows both figures and says which is which.

## The value model (`lib/model.ts`, `MODEL_VERSION = 'radar-4-factored'`)

Read off the snapshot's own live-token protocols, never a fixed constant:

- `fit(tvl) = 10^(intercept + slope·log10(tvl))` — a log-log least-squares fit of market-cap-to-TVL
  against TVL over the 128 live-token protocols. The slope is negative (~−0.48): larger protocols
  convert TVL to token value at a lower rate.
- Each category carries the median of its live tokens' **residual** from that fit; the multiple is
  `fit(tvl) · (category_multiple / fit(tvl))^w` with `w = n / (n + 30)`. The heavy shrinkage keeps the
  size fit in charge and lets only a well-sampled category move the number. Each row also carries the
  `confidence` of its multiple (`w`, the share the category was trusted).
- `growthMult = 1 + clamp(change_7d, −60, 120)/100 · 0.5`
- `maturityMult = 0.6 + min(age_days, 1095)/1095 · 0.4` (age from `listed_at`; unknown → 365 days)
- `base = tvl_usd · multiple` (the row's own `base_value_usd`), and
  `implied = max(1, round(tvl_usd · multiple · growthMult · maturityMult))`, computed from the rounded
  factors so the page recomputes the row's own number exactly (verified for all 198 rows).

`leaveOneOut` is the out-of-sample evidence: for each live protocol it refits the line without that
protocol and compares three predictions to the real market cap in natural-log error.

On this snapshot: calibrated **1.19006**, size-fit-only **1.22340**, single-multiple baseline
**1.62326**. So the size fit cuts the baseline's typical miss by **26.7%**, and the category residual
adds a further **2.7%** over the fit alone. The page states all three, and draws the fit against every
live token and every pre-token row as a scatter.

## The board

`buildBoard` covers every watchlist slug (the floor) and then adds the strongest pre-token protocols
the list leaves out — below the floor **and** at/above it where the list dropped them — selected by the
same model's implied value (`EARLY_ROWS = 200`). `isRankable` excludes the same product classes the
watchlist rule does, so the whole board is launch-candidate protocols, not the wrapped products. The
result is **198 rows**: 40 watchlist + 158 early. Each row carries 6 farm steps, each an action with a
cost and a time, derived from the protocol's category, chains, TVL and age.

## The dashboard (`dashboard/`)

`index.html` + `app.css` + `app.js`, no framework, no network. The page opens on a radar scope that
plots every ranked protocol as a blip (radius = log TVL, angle = rank), then the ranked board, then a
worked example of the pricing on the top row, then the value model drawn as a scatter (live tokens vs
the fitted line, pre-token rows as marks), its calibration cards and the watchlist audit.

Four views (Watchlist floor, Early radar, All pre-token, Live tokens), a search box, category and chain
filters and a minimum-implied-value filter, every column sortable, and a detail drawer that shows the
full derivation of one row (TVL, growth, age, size fit, category multiple and weight, base value, the
two multipliers, implied value) and its farm plan. The page recomputes each row from the snapshot
figures and checks it against the board.

The farm plan is the same derivation `lib/model.ts` writes to `board.json`, mirrored in the page so the
two agree: it leads with the protocol's own record (TVL, seven-day growth, age with no token), then a
fresh wallet, the category's primary action at a stated capital and round-trip gas, a second kind of
activity, the hold, and the claim-and-log step.

## Screenshots

`tools/shoot.mjs` serves `out/` locally and drives Chromium. The page is rendered 1060 CSS px wide at
1.3585 device pixels each, so every image is **1440 px** on its long side (the gate's cap); each shot
picks the window height and scroll that fill the frame and land in the dossier's **300–350 KiB** band:
board 332 KiB (1440×1440), detail 318 KiB (1440×1060), filtered 328 KiB (1440×1440).

## Run result

```
token radar: 758 protocols, 40 on the watchlist (the rule derives 60), 198 rows scored (158 early, 40 live set aside)
token radar: model radar-4-factored: multiple read off 128 live tokens, out-of-sample error 1.19006 vs fit-only 1.2234 and baseline 1.62326
token radar: wrote out/board.json, out/data.js, out/dashboard (3 files), out/screenshots (3 images) and out/dossier.json
```

Two runs write byte-identical output. The local gate (`tools/gate.mjs`) passes every row it can check.

## Files

| Path | Role |
|---|---|
| `main.ts` | entry point: read snapshot → build board → write outputs → dossier |
| `lib/model.ts` | watchlist rule, value model, farm plans, board, gate check |
| `lib/report.ts` | the plain-text summary and farm economics |
| `dashboard/` | the static page (html, css, js) |
| `screenshots/` | the three screenshots (board, detail, filtered) |
| `vendor/makefun-board.ts` | the dossier library (unmodified) |
| `tools/gate.mjs` | local gate verifier |
| `tools/shoot.mjs` | captures the three screenshots |
