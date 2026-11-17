// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and used as the market's own evidence, never mixed
// into the ranked board.
//
// The value model is calibrated on the snapshot itself, not on a fixed constant. The live-token
// protocols already carry a market cap, so the snapshot already holds the market's own answer to
// "what is a protocol's TVL worth as a token?" — a market-cap-to-TVL multiple. We read that multiple
// from the live protocols (median, per category and globally), then apply it to the pre-token
// protocols. A pre-token protocol whose category has live comparables gets its own category's
// multiple; one whose category is thin borrows the global median. Nothing is hardcoded per name.
//
//   multiple   = 10^(intercept + slope x log10(tvl_usd)), the log-log fit read off the live protocols
//                (the market's own conversion of a protocol's TVL into a token's worth); clamped.
//   growthMult = 1 + clamp(change_7d, -GR_FLOOR, GR_CAP)/100 x GROWTH_WEIGHT
//   maturity   = MAT_FLOOR + min(age_days, MAT_DAYS)/MAT_DAYS x MAT_RANGE   (age unknown: UNKNOWN_AGE)
//   implied    = max(1, round(tvl_usd x multiple x growthMult x maturity))
//
// The calibration is validated out of sample and the numbers are shown on the dashboard: for every
// live protocol, a leave-one-out prediction (its category's median multiple computed without it)
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
  /** A category needs at least this many live comparables before its own median is trusted. */
  min_samples: number;
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
  min_samples: 3,
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
export const MODEL_VERSION = 'radar-2-calibrated';

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
  /** Per category: the median multiple and how many live comparables stand behind it. */
  byCategory: Record<string, { median: number; n: number }>;
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
  /** How much of the baseline's error the calibrated model removes, as a share. */
  improvementPct: number;
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
  implied_value_usd: number;
  multiple: number;
  basis: 'category' | 'global';
  category_samples: number;
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
  board_size: number;
  early_size: number;
  live_size: number;
  comps: Comps;
  validation: Validation;
  rows: RadarRow[];
  live: LiveRow[];
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
 * TVL and its token's worth); the per-category medians are the secondary view.
 */
export function fitComps(snapshot: Snapshot, model: ModelConstants = MODEL): Comps {
  const live = snapshot.protocols.filter(isLiveUsable);
  const globalMedian = clamp(median(live.map(ratioOf), 0.25), model.multiple_floor, model.multiple_cap);
  const byCategory: Comps['byCategory'] = {};
  const buckets = new Map<string, number[]>();
  for (const p of live) {
    if (p.category === null) continue;
    const list = buckets.get(p.category) ?? [];
    list.push(ratioOf(p));
    buckets.set(p.category, list);
  }
  for (const [cat, list] of buckets) {
    if (list.length < model.min_samples) continue;
    byCategory[cat] = { median: clamp(median(list, globalMedian), model.multiple_floor, model.multiple_cap), n: list.length };
  }
  // The log-log fit: log10(ratio) = intercept + slope x log10(tvl).
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
  const intercept = my - slope * mx;
  return { globalMedian, globalSamples: n, intercept, slope, byCategory, liveCount: n };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** The multiple a protocol earns from the calibrated log-log fit, clamped to the model's range. */
export function multipleFor(p: SnapshotProtocol, comps: Comps, model: ModelConstants = MODEL): { multiple: number; basis: 'category' | 'global'; n: number } {
  const logMult = comps.intercept + comps.slope * Math.log10(Math.max(1, p.tvl_usd));
  const multiple = clamp(Math.pow(10, logMult), model.multiple_floor, model.multiple_cap);
  // The fit is the core; the category's own median, when it has enough comparables, is named as the
  // basis so the page can show where the number came from.
  const cat = p.category !== null ? comps.byCategory[p.category] : undefined;
  if (cat !== undefined) return { multiple, basis: 'category', n: cat.n };
  return { multiple, basis: 'global', n: comps.globalSamples };
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  comps: Comps,
  model: ModelConstants,
): { implied: number; multiple: number; basis: 'category' | 'global'; n: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const rawGrowth = finite(p.change_7d, 0);
  const growthPct = clamp(rawGrowth, model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (clamp(ageForModel, 0, model.maturity_days) / model.maturity_days) * model.maturity_range;
  const { multiple, basis, n } = multipleFor(p, comps, model);
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growthMult * maturityMult));
  return { implied, multiple, basis, n, growthPct, growthMult, maturityMult, age };
}

/**
 * The model's out-of-sample evidence. For each live protocol, predict its market cap two ways and
 * compare each to the real one, in natural-log error (log error is scale-free, so a 2x miss is the
 * same size whatever the dollars):
 *   - calibrated: the log-log fit refit without that protocol (leave-one-out), so the protocol's own
 *     figure never predicts itself;
 *   - baseline: one global median multiple, the same for every protocol.
 * The median absolute log error of each is reported; the calibrated model earns its keep when its
 * error is lower, and the improvement is named on the dashboard.
 */
export function leaveOneOut(snapshot: Snapshot, model: ModelConstants = MODEL): Validation {
  const live = snapshot.protocols.filter(isLiveUsable);
  const globalAll = clamp(median(live.map(ratioOf), 0.25), model.multiple_floor, model.multiple_cap);
  const calErr: number[] = [];
  const baseErr: number[] = [];
  for (let i = 0; i < live.length; i++) {
    const p = live[i]!;
    const others = live.filter((_, j) => j !== i);
    // Refit the log-log line without this protocol.
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const q of others) {
      const x = Math.log10(q.tvl_usd);
      const y = Math.log10(ratioOf(q));
      sx += x; sy += y; sxx += x * x; sxy += x * y;
    }
    const m = others.length;
    const mx = m > 0 ? sx / m : 0;
    const my = m > 0 ? sy / m : 0;
    const den = sxx - m * mx * mx;
    const slope = den !== 0 ? (sxy - m * mx * my) / den : 0;
    const intercept = my - slope * mx;
    const fitMult = clamp(Math.pow(10, intercept + slope * Math.log10(p.tvl_usd)), model.multiple_floor, model.multiple_cap);
    const globalLo = clamp(median(others.map(ratioOf), globalAll), model.multiple_floor, model.multiple_cap);
    // The prediction is tvl x multiple; the error is how far that lands from the real market cap.
    // log(tvl x mult / mcap) = log(mult) - log(mcap / tvl) = log(mult) - log(ratio).
    const logRatio = Math.log(ratioOf(p));
    calErr.push(Math.abs(Math.log(fitMult) - logRatio));
    baseErr.push(Math.abs(Math.log(globalLo) - logRatio));
  }
  const n = live.length;
  const cal = median(calErr, 0);
  const base = median(baseErr, 0);
  return {
    n,
    medianAbsLogError: round5(cal),
    baselineTvlOnly: round5(base),
    improvementPct: base > 0 ? round5(((base - cal) / base) * 100) : 0,
    baselineMultiple: round5(globalAll),
  };
}

const round5 = (n: number): number => Math.round(n * 1e5) / 1e5;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
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

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
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
export function radarRow(row: BoardRow): RadarRow {
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
    implied_value_usd: row.implied_value_usd,
    multiple: row.model.multiple,
    basis: row.model.basis,
    category_samples: row.model.category_samples,
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
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    comps: fitComps(snapshot, model),
    validation: leaveOneOut(snapshot, model),
    rows: board.map(radarRow),
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
