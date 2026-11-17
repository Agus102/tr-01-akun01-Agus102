// lib/report.ts — the radar's written summary and its farm economics.
//
// The board's numbers are the model's claim; this module turns them into the two things a reader acts
// on: a plain-text summary of what the radar found (written to /output/radar.md, beside the page) and,
// for each protocol, a small economics block that says what a farm position costs, how long it is held
// and what the implied value is worth per hour of work. Nothing here reads the clock or the network:
// every figure comes from the snapshot and the board the model already built, so the output is a pure
// function of the snapshot and two runs write the same bytes.
//
// The economics are deliberately conservative and stated as assumptions, never as promises: an
// airdrop, if one comes, is a share of an implied value that is itself a model. The reader is told the
// assumption, the capital, the hold and the net per hour so the comparison between two protocols is
// honest rather than a slogan.

import type { BoardRow, Comps, SnapshotProtocol, Validation } from './model.ts';
import { AIRDROP_SHARE } from './model.ts';

/** What one farm position costs and returns, as the report states it. */
export interface FarmEconomics {
  /** The capital the position ties up, in whole dollars. */
  capital_usd: number;
  /** The round-trip gas and fees the plan names, in whole dollars. */
  cost_usd: number;
  /** How many days the position should stay open. */
  hold_days: number;
  /** The hours of the reader's attention the plan asks for, setup plus the weekly checks. */
  hours: number;
  /** The implied value the position is angling for, in whole dollars. */
  implied_value_usd: number;
  /** The share of implied value a typical airdrop hands a single wallet, an explicit assumption. */
  airdrop_share: number;
  /** The implied value times the share, over the hours: the net the reader is actually chasing. */
  net_usd_per_hour: number;
}

/** The share of an implied value one wallet's farm is assumed to capture, from the model. */
export { AIRDROP_SHARE };

/** The capital a position ties up, from the protocol's own TVL. */
export function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long a position should stay open, from how young the protocol is. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The hours one position asks of the reader: setup, a weekly check over the hold, and the unwind. */
export function hoursFor(holdDays: number): number {
  const weeks = Math.max(1, Math.ceil(holdDays / 7));
  return Math.round((0.5 + weeks * 0.2 + 0.3) * 10) / 10;
}

/** The farm economics of one board row: capital, cost, hold, hours and the net per hour of work. */
export function economicsFor(row: BoardRow): FarmEconomics {
  const capital = capitalFor(row as unknown as SnapshotProtocol);
  const hold = holdDaysFor(row.age_days);
  const hours = hoursFor(hold);
  const cost = capital >= 150 ? 12 : 7;
  const net = (row.implied_value_usd * AIRDROP_SHARE) / hours;
  return {
    capital_usd: capital,
    cost_usd: cost,
    hold_days: hold,
    hours,
    implied_value_usd: row.implied_value_usd,
    airdrop_share: AIRDROP_SHARE,
    net_usd_per_hour: Math.round(net * 100) / 100,
  };
}

/** A whole-dollar string with thousands separators, for the report's plain text. */
export function usd(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

/**
 * The radar's written summary: what it read, how the model was calibrated, the strongest rows with
 * their economics, and the honest limits of a model. Written to /output/radar.md.
 */
export function buildReport(
  rows: BoardRow[],
  comps: Comps,
  validation: Validation,
  asOf: string,
  watchlistSize: number,
  derivedWatchlist: number,
  topN = 25,
): string {
  const lines: string[] = [];
  lines.push('# Token Radar — pre-token protocols ranked by implied value');
  lines.push('');
  lines.push(`Snapshot as of ${asOf}. The snapshot names ${watchlistSize} watchlist protocols: at least $50M of TVL, no token on record, and not a wrapped, staked or bridged product of a token that already trades. The brief's rule, read from the ten fields this snapshot carries, keeps ${derivedWatchlist}; the extra ones are sub-protocols DefiLlama hangs off a parent, a field the ten omit. The snapshot's own list is the floor and the board covers it whole. The board ranks ${rows.length} pre-token protocols by what their launch would be worth.`);
  lines.push('');
  lines.push('## The value model');
  lines.push('');
  lines.push(`The multiple that turns a protocol's TVL into an implied token value is read from the ${comps.liveCount} protocols in this same snapshot that already trade a token. The core is a log-log fit of market-cap-to-TVL against TVL — the market's own size effect — corrected by each category's typical residual from that fit, shrunk toward zero by how few live comparables the category has. It is not a fixed constant and no protocol name is special-cased.`);
  lines.push('');
  lines.push(`- fit(TVL) = 10^(${comps.intercept.toFixed(4)} + ${comps.slope.toFixed(4)} * log10(tvl_usd))`);
  lines.push(`- multiple = fit(TVL) * (category multiple / fit(TVL))^w,  w = n / (n + 30)`);
  lines.push(`- out-of-sample error (leave-one-out over ${validation.n} live protocols): ${validation.medianAbsLogError} median absolute log error`);
  lines.push(`- against the size fit alone (${validation.fitOnlyAbsLogError}): the category correction moves it by ${validation.categoryGainPct}%`);
  lines.push(`- against a single fixed multiple (${validation.baselineMultiple}x): ${validation.baselineTvlOnly}, so the calibration cuts the typical miss by ${validation.improvementPct}%`);
  lines.push('');
  lines.push('A prediction is a model, not a price. The out-of-sample error above is the honest size of the miss to expect.');
  lines.push('');
  lines.push('## The board');
  lines.push('');
  lines.push('| # | Protocol | Category | TVL | 7d | Age | Implied value | Farm net $/hr |');
  lines.push('|--:|---|---|--:|--:|--:|--:|--:|');
  for (const row of rows.slice(0, topN)) {
    const e = economicsFor(row);
    const cat = row.category ?? 'Other';
    const growth = row.change_7d === null ? 'n/a' : `${row.change_7d >= 0 ? '+' : ''}${row.change_7d.toFixed(1)}%`;
    const age = row.age_days === null ? 'n/a' : `${Math.round(row.age_days)}d`;
    lines.push(`| ${row.rank} | ${row.name} | ${cat} | ${usd(row.tvl_usd)} | ${growth} | ${age} | ${usd(row.implied_value_usd)} | ${e.net_usd_per_hour} |`);
  }
  lines.push('');
  lines.push(`Rows beyond the top ${topN} are in board.json and on the dashboard.`);
  lines.push('');
  lines.push('## How to read a farm plan');
  lines.push('');
  lines.push(`Every row carries 3 to 12 steps with a cost and a time. The net $/hr column is the implied value times an assumed ${AIRDROP_SHARE * 100}% share for one wallet, over the hours the plan asks for. That share is an assumption, stated so two protocols can be compared, never a promise: a protocol may never issue a token, and its record says so.`);
  return lines.join('\n') + '\n';
}
