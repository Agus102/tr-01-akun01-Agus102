# Token Radar — run notes

## Files read

### `main.ts` (entry point, Node 22, stdlib only)
- Reads a sealed snapshot from `--input <file|dir>` (default `/input`); a directory means `snapshot.json` inside it. Exits 2 if the snapshot is missing.
- Output dir comes from `--output` or `MAKEFUN_OUTPUT_DIR` (default `/output`).
- Pipeline: `parseSnapshot` → `buildRadar` (board + radar data) → `boardIssue` gate check (exits 1 if the model wrote a board the gate refuses).
- Writes `board.json`, `data.js` (dashboard dataset as `window.RADAR=...`), `radar.md` (plain-text summary), copies `dashboard/` and `screenshots/` into the output, then writes `dossier.json` last (the judge rebuilds it from `/output` and compares bytes).
- Hand-in gates enforced here: `TEXT_MAX_BYTES = 65536`, screenshot caps `{ max: 4, max_bytes: 524288 }`, image names must match `/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/`, and **at least 3 screenshots** are required.

### `lib/model.ts` (the scoring model)
- `MODEL_VERSION = 'radar-2-calibrated'`; constants in `MODEL` (min_samples 3, growth weight 0.5 with floor -60 / cap 120, maturity floor 0.6 / range 0.4 over 1095 days, unknown age 365d, multiple clamped 0.02..40). `EARLY_ROWS = 160`, `LIVE_ROWS = 40`.
- A protocol is **pre-token** when it has no mcap, no gecko_id and no symbol (`isPreToken`); **rankable** = pre-token, not CEX, and not a versioned pool (`/\s(V\d+|v\d+|\d+\.\d+)$/`).
- Board = every watchlist slug (the floor) + up to 160 pre-token protocols ranked by TVL below `floor_usd`, all scored and sorted by implied value.
- Calibration is read off the snapshot itself, never hardcoded: `fitComps` computes a **log-log least-squares fit** of `mcap/tvl` against `tvl` over live-token protocols (`log10(mult) = intercept + slope·log10(tvl)`), plus per-category medians (only when `n ≥ min_samples`).
  - `growthMult = 1 + clamp(change_7d, -60, 120)/100 × 0.5`
  - `maturityMult = 0.6 + min(age_days, 1095)/1095 × 0.4` (unknown age → 365d)
  - `implied = max(1, round(tvl × multiple × growthMult × maturityMult))`
- `leaveOneOut` is the out-of-sample evidence: for each live protocol it refits the line without that protocol and compares against the real mcap in natural-log error, versus a single-global-multiple baseline.
- `boardIssue` is the gate: board must cover every watchlist slug, ranks 1..n with no gaps, implied values non-increasing, not all rows equal, each row 3–12 farm steps of 20–600 chars, and positive integer implied values.
- Farm plans are derived from the protocol's own record (category, chains, TVL, age) via `farmSteps`, not a hand-written name list.

## Snapshot location
```
/root/makefun/accounts/akun01/entries/token-radar/token-radar-01-kit/input/snapshot.json
```
(only match under `/root/makefun/accounts/akun01`)

## Command run
```
cd /root/makefun/accounts/akun01/entries/token-radar
MAKEFUN_OUTPUT_DIR=out node main.ts --input token-radar-01-kit/input/snapshot.json
```

## Result — success (exit 0)
```
token radar: 758 protocols, 40 on the watchlist, 200 rows scored (160 early, 40 live set aside)
token radar: model radar-2-calibrated: multiple read off 128 live tokens, out-of-sample error 1.2234 vs baseline 1.62326
token radar: wrote out/board.json, out/data.js, out/dashboard (3 files), out/screenshots (3 images) and out/dossier.json
```
- Snapshot as of **2026-11-14**, 758 protocols, watchlist of 40.
- Board: **200 rows** = 40 watchlist + 160 early.
- Calibration: `multiple = 10^(3.0247 − 0.4777·log10(tvl))`, read off 128 live tokens. Leave-one-out median abs log error **1.2234** vs baseline **1.62326** → the calibration cuts the typical miss by ~24.6%. Baseline single multiple 0.2138x.
- Gate passed (no `boardIssue`), 3 screenshots present and valid.

### Outputs written to `out/`
| File | Size | Notes |
|---|---:|---|
| `board.json` | 282 KB | 200 ranked rows |
| `data.js` | 95 KB | `window.RADAR=...` dashboard dataset |
| `radar.md` | 3.6 KB | plain-text summary |
| `dossier.json` | 685 KB | summary the judge reads (written last) |
| `dashboard/` | 3 files | `index.html`, `app.css`, `app.js` |
| `screenshots/` | 3 images | `1-board.png`, `2-detail.png`, `3-filtered.png` |

### Top of the board
| # | Protocol | Category | TVL | Multiple | Basis | Implied value |
|--:|---|---|--:|--:|---|--:|
| 1 | Steakhouse Financial | Risk Curators | $2.75B | 0.0327 | global | $71,161,725 |
| 2 | Gauntlet | Risk Curators | $1.58B | 0.0427 | global | $55,305,310 |
| 3 | Veda | Onchain Capital Allocator | $1.56B | 0.0429 | global | $53,403,308 |
| 4 | USDD | CDP | $1.06B | 0.0517 | category | $44,334,718 |
| 5 | Upshift | Onchain Capital Allocator | $499M | 0.0740 | global | $33,058,891 |
| 6 | Symbiotic | Collateral Markets | $254M | 0.1022 | global | $22,527,999 |
| 7 | OnRe | RWA | $309M | 0.0931 | category | $22,385,230 |
| 8 | Nonce Capital | Risk Curators | $514M | 0.0730 | global | $21,990,022 |

## Notes / observations
- The log-log slope is negative (−0.4777), so larger-TVL protocols get a smaller multiple of their TVL — the model explicitly documents that this is the market's own relationship, read from the snapshot.
- Most top rows resolve `basis: global`; only categories with `n ≥ 3` live comparables (e.g. CDP, RWA) get a category basis, even though the multiple always comes from the fit.
- The `MODULE_TYPELESS_PACKAGE_JSON` warning is benign: `main.ts` is ESM syntax but `/root/makefun/package.json` has no `"type": "module"`, so Node reparses it as ESM. Not an error; the run still succeeds.
