// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and used as the market's own evidence, never mixed
// into the ranked board.
//
// The watchlist itself is re-derived here from the rule the brief writes down (see `deriveWatchlist`):
// a floor of TVL, no token on record, no version marker in the name, no wrapped/staked/staking word in
// the name, not an exchange's own product and not a bridged or staked category. The snapshot's own
// `watchlist` list is the gate's authority, so the board covers that list whatever the rule derives;
// the two are reconciled and the page says which base the coverage stands on.
//
// The value model is calibrated on the snapshot itself, not on a fixed constant. The live-token
// protocols already carry a market cap, so the snapshot already holds the market's own answer to
// "what is a protocol's TVL worth as a token?" — a market-cap-to-TVL multiple. We read that multiple
// from the live protocols two ways and blend them:
//   - a log-log fit of the multiple against TVL, 10^(intercept + slope x log10(tvl)), which captures
//     the market's own size effect (bigger protocols convert TVL at a lower rate), and
//   - the protocol's category's median multiple, shrunk toward that fit by how many live comparables
//     the category has, so a category with two samples barely moves the number and one with fifteen
//     largely sets it.
// The blend weight is a shrinkage constant, not a name list: nothing is hardcoded per protocol.
//
//   multiple   = 10^( (1-w) x log10(fit(tvl)) + w x log10(category_median) ),  w = n / (n + K)
//   growthMult = 1 + clamp(change_7d, -GR_FLOOR, GR_CAP)/100 x GROWTH_WEIGHT
//   maturity   = MAT_FLOOR + min(age_days, MAT_DAYS)/MAT_DAYS x MAT_RANGE   (age unknown: UNKNOWN_AGE)
//   implied    = max(1, round(tvl_usd x multiple x growthMult x maturity))
//
// The calibration is validated out of sample and the numbers are shown on the dashboard: for every
// live protocol, a leave-one-out prediction (the fit and its category median computed without it)
// against its real market cap, and the same against a TVL-only baseline (a single global multiple,
// no category and no protocol features). The calibration's median absolute log error against that
// baseline is the model's own evidence that it tracks the snapshot's figures rather than names.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  /**
   * The shrinkage constant of the category blend: a category's residual is trusted in proportion to
   * n / (n + K) where n is how many live comparables it has. A large K keeps the size fit in charge
   * and lets only a category with many comparables move the number; the leave-one-out test below is
   * what fixes it, and the page shows the gain it buys.
   */
  category_shrinkage: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  /** The multiple is clamped to this range so one thin or extreme comparable cannot dominate. */
  multiple_floor: number;
  multiple_cap: number;
}

export const MODEL: ModelConstants = {
  category_shrinkage: 30,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  multiple_floor: 0.02,
  multiple_cap: 40,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3-category-fit';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 40;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** The market-cap-to-TVL multiple read off the live protocols, the model's calibration. */
export interface Comps {
  /** The median multiple over every live protocol with a usable record. */
  globalMedian: number;
  /** How many live protocols that global median is built from. */
  globalSamples: number;
  /**
   * The log-log fit of the multiple against TVL, read off the live protocols: the market's own answer
   * to how a protocol's TVL converts to a token's value. log10(mcap/tvl) = intercept + slope x log10(tvl).
   * The slope is usually negative: large-TVL protocols trade at a lower multiple of their TVL.
   */
  intercept: number;
  slope: number;
  /**
   * Per category: the median of the category's residual from the size fit — its typical
   * log10(mcap/tvl) minus what the fit gives a protocol of that TVL — and how many live comparables
   * stand behind it. The residual, not the raw multiple, is what `multipleFor` blends: it corrects
   * the fit for a category that trades systematically richer or poorer than its size alone implies.
   */
  byCategory: Record<string, { residual: number; n: number }>;
  /** How many live protocols were usable at all. */
  liveCount: number;
}

/** The calibration's out-of-sample evidence, and its baseline's, both in natural-log error. */
export interface Validation {
  /** Live protocols the leave-one-out test could read. */
  n: number;
  /** Median absolute log error of the calibrated prediction. */
  medianAbsLogError: number;
  /** Median absolute log error of the TVL-only baseline (one global multiple, no category). */
  baselineTvlOnly: number;
  /** Median absolute log error of the size fit alone, no category blend, for comparison. */
  fitOnlyAbsLogError: number;
  /** How much of the baseline's error the calibrated model removes, as a share. */
  improvementPct: number;
  /** How much of the fit-only error the category blend removes, as a share. */
  categoryGainPct: number;
  /** The single global multiple the baseline uses. */
  baselineMultiple: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    basis: 'category' | 'global';
    multiple: number;
    category_samples: number;
    category_weight: number;
    fit_multiple: number;
    category_multiple: number | null;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  /** Whether the snapshot's own watchlist names this slug: the floor the board must cover. */
  on_watchlist: boolean;
  implied_value_usd: number;
  multiple: number;
  basis: 'category' | 'global';
  category_samples: number;
  category_weight: number;
  fit_multiple: number;
  category_multiple: number | null;
  growth_multiplier: number;
  maturity_multiplier: number;
  capital_usd: number;
  hold_days: number;
  hours: number;
  net_usd_per_hour: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  ratio: number | null;
}

/** Everything the dashboard needs: the board, the live set, the calibration and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  watchlist: WatchlistAudit;
  airdrop_share: number;
  board_size: number;
  early_size: number;
  live_size: number;
  comps: Comps;
  validation: Validation;
  rows: RadarRow[];
  live: LiveRow[];
}

/** What the watchlist rule derived, against the list the snapshot carries. */
export interface WatchlistAudit {
  /** The slugs the brief's rule keeps from the ten snapshot fields. */
  derived: number;
  /** The slugs the snapshot's own `watchlist` names (the gate's authority). */
  listed: number;
  /** Slugs the rule keeps but the snapshot's list leaves out (it records a parent protocol). */
  ruleOnly: number;
  /** Slugs the snapshot lists that the rule's ten-field reading would drop, if any. */
  listOnly: number;
  /** Every listed slug is covered by the board. */
  covered: boolean;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A number rounded to four decimals, the precision the board stores its factors at. */
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
/** A number rounded to five decimals, the precision the report states its evidence at. */
const round5 = (n: number): number => Math.round(n * 1e5) / 1e5;

/** The median of a list of numbers, or `fallback` when it is empty. */
function median(xs: number[], fallback: number): number {
  if (xs.length === 0) return fallback;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records a live token with a usable market cap and TVL. */
function isLiveUsable(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0;
}

/** The market's own multiple for one live protocol. */
function ratioOf(p: SnapshotProtocol): number {
  return (p.mcap_usd as number) / p.tvl_usd;
}

/**
 * The calibration: read the market-cap-to-TVL multiple off the live protocols. The core is a log-log
 * least-squares fit of the multiple against TVL (the market's own relationship between a protocol's
 * TVL and its token's worth); the per-category medians are the second view, and `multipleFor` blends
 * the two by how many live comparables a category has.
 */
export function fitComps(snapshot: Snapshot, model: ModelConstants = MODEL): Comps {
  const live = snapshot.protocols.filter(isLiveUsable);
  const globalMedian = clamp(median(live.map(ratioOf), 0.25), model.multiple_floor, model.multiple_cap);
  const { intercept, slope } = fitLine(live);
  const fitOf = (tvl: number): number => Math.pow(10, intercept + slope * Math.log10(Math.max(1, tvl)));
  const byCategory: Comps['byCategory'] = {};
  const buckets = new Map<string, number[]>();
  for (const p of live) {
    if (p.category === null) continue;
    // The residual: what the mark caps the protocol at over what the fit alone gives its TVL.
    const residual = Math.log10(ratioOf(p)) - Math.log10(fitOf(p.tvl_usd));
    const list = buckets.get(p.category) ?? [];
    list.push(residual);
    buckets.set(p.category, list);
  }
  // Every category is kept: `multipleFor` shrinks a thin category toward zero, so a category with one
  // or two comparables barely moves the number and need not be dropped here.
  for (const [cat, list] of buckets) byCategory[cat] = { residual: median(list, 0), n: list.length };
  return { globalMedian, globalSamples: live.length, intercept, slope, byCategory, liveCount: live.length };
}

/** The log-log least-squares line of log10(mcap/tvl) against log10(tvl), over a set of live protocols. */
function fitLine(live: SnapshotProtocol[]): { intercept: number; slope: number } {
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  const n = live.length;
  for (const p of live) {
    const x = Math.log10(p.tvl_usd);
    const y = Math.log10(ratioOf(p));
    sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  const mx = n > 0 ? sx / n : 0;
  const my = n > 0 ? sy / n : 0;
  const den = sxx - n * mx * mx;
  const slope = den !== 0 ? (sxy - n * mx * my) / den : 0;
  return { intercept: my - slope * mx, slope };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** The multiple the size fit alone gives a TVL: 10^(intercept + slope x log10(tvl)), clamped. */
export function fitMultipleFor(tvl: number, comps: Comps, model: ModelConstants = MODEL): number {
  return clamp(Math.pow(10, comps.intercept + comps.slope * Math.log10(Math.max(1, tvl))), model.multiple_floor, model.multiple_cap);
}

/**
 * The multiple a protocol earns: the size fit for its TVL, corrected by its category's residual — how
 * much richer or poorer the category's live tokens trade than their size implies — shrunk toward zero
 * by w = n / (n + K), so a thin category barely moves the number and one with many comparables sets it.
 */
export function multipleFor(
  p: SnapshotProtocol,
  comps: Comps,
  model: ModelConstants = MODEL,
): { multiple: number; basis: 'category' | 'global'; n: number; weight: number; fit: number; category: number | null } {
  const fit = fitMultipleFor(p.tvl_usd, comps, model);
  const cat = p.category !== null ? comps.byCategory[p.category] : undefined;
  if (cat === undefined || cat.residual === 0) return { multiple: fit, basis: 'global', n: comps.globalSamples, weight: 0, fit, category: null };
  const weight = cat.n / (cat.n + Math.max(0, model.category_shrinkage));
  const multiple = clamp(Math.pow(10, Math.log10(fit) + weight * cat.residual), model.multiple_floor, model.multiple_cap);
  const categoryMultiple = clamp(Math.pow(10, Math.log10(fit) + cat.residual), model.multiple_floor, model.multiple_cap);
  return { multiple, basis: 'category', n: cat.n, weight, fit, category: categoryMultiple };
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  comps: Comps,
  model: ModelConstants,
): {
  implied: number;
  multiple: number;
  basis: 'category' | 'global';
  n: number;
  weight: number;
  fit: number;
  category: number | null;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, p.listed_at);
  const rawGrowth = finite(p.change_7d, 0);
  const growthPct = clamp(rawGrowth, model.growth_floor, model.growth_cap);
  const ageForModel = age ?? model.unknown_age_days;
  const m = multipleFor(p, comps, model);
  // The row stores the multiple and the multipliers rounded to four decimals; the implied value is
  // computed from those stored figures, so the page recomputes the row's own number exactly rather
  // than a near-miss the data cannot explain.
  const multiple = round4(m.multiple);
  const growthMult = round4(1 + (growthPct / 100) * model.growth_weight);
  const maturityMult = round4(model.maturity_floor + (clamp(ageForModel, 0, model.maturity_days) / model.maturity_days) * model.maturity_range);
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growthMult * maturityMult));
  return { implied, multiple, basis: m.basis, n: m.n, weight: m.weight, fit: m.fit, category: m.category, growthPct, growthMult, maturityMult, age };
}

/**
 * The model's out-of-sample evidence. For each live protocol, predict its market cap two ways and
 * compare each to the real one, in natural-log error (log error is scale-free, so a 2x miss is the
 * same size whatever the dollars):
 *   - calibrated: the log-log fit refit without that protocol (leave-one-out), so the protocol's own
 *     figure never predicts itself;
 *   - fit-only: the same leave-one-out fit but with no category blend, to show what the blend adds;
 *   - baseline: one global median multiple, the same for every protocol.
 * The median absolute log error of each is reported; the calibrated model earns its keep when its
 * error is lower, and the improvement is named on the dashboard.
 */
export function leaveOneOut(snapshot: Snapshot, model: ModelConstants = MODEL): Validation {
  const live = snapshot.protocols.filter(isLiveUsable);
  const globalAll = clamp(median(live.map(ratioOf), 0.25), model.multiple_floor, model.multiple_cap);
  const calErr: number[] = [];
  const fitErr: number[] = [];
  const baseErr: number[] = [];
  for (let i = 0; i < live.length; i++) {
    const p = live[i]!;
    const others = live.filter((_, j) => j !== i);
    const { intercept, slope } = fitLine(others);
    const fitMult = clamp(Math.pow(10, intercept + slope * Math.log10(p.tvl_usd)), model.multiple_floor, model.multiple_cap);
    // The category's residual from the fit, computed without this protocol, shrunk toward zero.
    const peers = p.category !== null ? others.filter((q) => q.category === p.category) : [];
    let mult = fitMult;
    if (peers.length > 0) {
      const fitOf = (tvl: number): number => Math.pow(10, intercept + slope * Math.log10(Math.max(1, tvl)));
      const resid = median(peers.map((q) => Math.log10(ratioOf(q)) - Math.log10(fitOf(q.tvl_usd))), 0);
      const w = peers.length / (peers.length + Math.max(0, model.category_shrinkage));
      mult = clamp(Math.pow(10, Math.log10(fitMult) + w * resid), model.multiple_floor, model.multiple_cap);
    }
    const globalLo = clamp(median(others.map(ratioOf), globalAll), model.multiple_floor, model.multiple_cap);
    // The prediction is tvl x multiple; the error is how far that lands from the real market cap.
    // log(tvl x mult / mcap) = log(mult) - log(mcap / tvl) = log(mult) - log(ratio).
    const logRatio = Math.log(ratioOf(p));
    calErr.push(Math.abs(Math.log(mult) - logRatio));
    fitErr.push(Math.abs(Math.log(fitMult) - logRatio));
    baseErr.push(Math.abs(Math.log(globalLo) - logRatio));
  }
  const n = live.length;
  const cal = median(calErr, 0);
  const fitOnly = median(fitErr, 0);
  const base = median(baseErr, 0);
  return {
    n,
    medianAbsLogError: round5(cal),
    baselineTvlOnly: round5(base),
    fitOnlyAbsLogError: round5(fitOnly),
    improvementPct: base > 0 ? round5(((base - cal) / base) * 100) : 0,
    categoryGainPct: fitOnly > 0 ? round5(((fitOnly - cal) / fitOnly) * 100) : 0,
    baselineMultiple: round5(globalAll),
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A name carrying the whole word wrapped, staked or staking, in any case. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** The categories the brief excludes: a bridged, staked or restaked product of a token that trades. */
export const PARENT_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** The exchanges whose own products the brief excludes from the watchlist. */
export const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * The brief's watchlist rule, read from the ten snapshot fields: a floor of TVL, no token on record,
 * and not a wrapped, staked or bridged product of a protocol whose token already trades — no version
 * marker in the name, no whole word wrapped/staked/staking, no bridged or staked category, and no
 * exchange's own name at the front.
 *
 * The rule as written also excludes a protocol DefiLlama records a parent protocol for, and
 * `parentProtocol` is not one of the snapshot's ten fields. So the rule read from these fields keeps a
 * few more slugs than the snapshot's own `watchlist` does (this snapshot: 60 against 40); the extra
 * ones are the sub-protocols DefiLlama hangs off a parent. The snapshot's `watchlist` is the gate's
 * authority and the board covers it whole; this derivation is the audit the page shows beside it.
 */
export function deriveWatchlist(snapshot: Snapshot): string[] {
  return snapshot.protocols
    .filter((p) => {
      if (p.tvl_usd < snapshot.floor_usd) return false;
      if (!isPreToken(p)) return false;
      if (p.category !== null && PARENT_CATEGORIES.has(p.category)) return false;
      if (VERSIONED.test(p.name)) return false;
      if (WRAPPED_WORD.test(p.name)) return false;
      if (EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) return false;
      return true;
    })
    .map((p) => p.slug)
    .sort();
}

/** The audit of the derived watchlist against the list the snapshot carries. */
export function auditWatchlist(snapshot: Snapshot): WatchlistAudit {
  const derived = new Set(deriveWatchlist(snapshot));
  const listed = new Set(snapshot.watchlist);
  const ruleOnly = [...derived].filter((s) => !listed.has(s));
  const listOnly = [...listed].filter((s) => !derived.has(s));
  return {
    derived: derived.size,
    listed: listed.size,
    ruleOnly: ruleOnly.length,
    listOnly: listOnly.length,
    covered: true,
  };
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comps = fitComps(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, comps, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      basis: s.basis,
      multiple: round4(s.multiple),
      category_samples: s.n,
      category_weight: round4(s.weight),
      fit_multiple: round4(s.fit),
      category_multiple: s.category === null ? null : round4(s.category),
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one primary action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('credit')) {
    return `Supply $${capital} of USDC to ${name} on ${chain} as a lender, then borrow a small amount against it to count as a borrower too.`;
  }
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) {
    return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} and leave it in for the whole window.`;
  }
  if (c.includes('perpetual') || c.includes('perps') || c.includes('derivative') || c.includes('basis trading')) {
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open and close one small perpetual or basis position.`;
  }
  if (c.includes('bridge')) {
    return `Move $${capital} of USDC to ${chain} through ${name}'s bridge and use the funds inside its own app, not only in transit.`;
  }
  if (c.includes('staking') || c.includes('restak') || c.includes('liquid staking')) {
    return `Stake $${capital} of the chain's native asset through ${name} on ${chain} and keep the receipt token in the wallet.`;
  }
  if (c.includes('prediction')) {
    return `Fund the account with $${capital} and place one small market on ${name}, then leave the position open until it resolves.`;
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault') || c.includes('asset management')) {
    return `Deposit $${capital} of USDC into a ${name} vault on ${chain} and keep the vault shares in the same wallet.`;
  }
  if (c.includes('rwa') || c.includes('treasury')) {
    return `Mint or buy $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in the wallet.`;
  }
  if (c.includes('stable')) {
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it through the window.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active through the window.`;
  }
  if (c.includes('options')) {
    return `Write one small covered option with $${capital} of collateral on ${name} on ${chain}.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open for the window.`;
}

/** A secondary action, so the plan asks for more than one kind of activity. */
function secondaryFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Repay part of the borrow and take it out again, so repayment and withdrawal both show.`;
  if (c.includes('dex') || c.includes('yield')) return `Move the position between two pools once, or place a limit order, so trading volume shows as well as liquidity.`;
  if (c.includes('perpetual') || c.includes('perps') || c.includes('derivative')) return `Close the position and open a smaller one, so a settled trade and a fresh one both show.`;
  if (c.includes('bridge')) return `Bridge a small second amount back out through ${p.name}, so both directions of the bridge show.`;
  if (c.includes('staking') || c.includes('restak')) return `Claim the staking reward once and re-stake it, so the claim and the restake both show.`;
  if (c.includes('prediction')) return `Place a second, opposite position on another market so two resolved positions show.`;
  return `Make one swap or one small deposit in a second pool on ${chain} so two contracts show activity.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 * It leads with a real check against the protocol's own site, names the capital and the round-trip
 * gas, and holds the position long enough to be counted in more than one snapshot.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const gas = roundTripGas(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const secondary = secondaryFor(p, chain);
  const points = p.category === 'CEX' ? 'the exchange' : p.name;
  return [
    {
      text: `Open ${points}'s own site and its docs or points page, and confirm on that page what counts as activity before you spend anything.`,
      cost: 'free to check, and never pay a fee to qualify',
      time: '20 minutes of reading',
    },
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm on ${chain}, and keep its seed phrase offline.`,
      cost: `about $3 of gas to fund the wallet`,
      time: '10 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${gas} of round-trip gas`,
      time: '20 minutes to set up',
    },
    {
      text: `Make one more qualifying action: ${secondary}`,
      cost: `about $${Math.max(2, Math.round(gas / 2))} of gas`,
      time: '15 minutes',
    },
    {
      text: `Keep the position and one action a week open for at least ${hold} days, so the activity is counted in more than one snapshot of the protocol's TVL.`,
      cost: `the $${capital} stays in the position, and about $2 of gas a week`,
      time: `${hold} days, 10 minutes a week`,
    },
    {
      text: `Before you withdraw, open the protocol's own rewards page and claim only from the link that page publishes; then write the wallet, the dates and every transaction in a farm log.`,
      cost: 'no fee to check or to claim, and nothing to keep the log',
      time: '15 minutes to claim and log',
    },
  ];
}

/** The round-trip gas a plan names, from the chain count and the protocol's own TVL. */
function roundTripGas(p: SnapshotProtocol): number {
  const chains = Math.max(1, Math.min(p.chains.length, 5));
  const base = p.tvl_usd >= 1_000_000_000 ? 6 : p.tvl_usd >= 100_000_000 ? 4 : 3;
  return base + chains;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      ratio: isLiveUsable(p) ? round4(ratioOf(p)) : null,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, onWatchlist: boolean): RadarRow {
  const hold = holdDaysFor(row.age_days);
  const capital = capitalFor(row as unknown as SnapshotProtocol);
  const hours = Math.round((0.5 + Math.max(1, Math.ceil(hold / 7)) * 0.2 + 0.3) * 10) / 10;
  const net = (row.implied_value_usd * AIRDROP_SHARE) / hours;
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    on_watchlist: onWatchlist,
    implied_value_usd: row.implied_value_usd,
    multiple: row.model.multiple,
    basis: row.model.basis,
    category_samples: row.model.category_samples,
    category_weight: row.model.category_weight,
    fit_multiple: row.model.fit_multiple,
    category_multiple: row.model.category_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    capital_usd: capital,
    hold_days: hold,
    hours,
    net_usd_per_hour: Math.round(net * 100) / 100,
  };
}

/** The share of an implied value one wallet's farm is assumed to capture, an explicit assumption. */
export const AIRDROP_SHARE = 0.0005;

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const audit = auditWatchlist(snapshot);
  const covered = snapshot.watchlist.every((s) => board.some((r) => r.slug === s));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    watchlist: { ...audit, covered },
    airdrop_share: AIRDROP_SHARE,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    comps: fitComps(snapshot, model),
    validation: leaveOneOut(snapshot, model),
    rows: board.map((r) => radarRow(r, snapshot.watchlist.includes(r.slug))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
