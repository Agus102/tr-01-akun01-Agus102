# Token Radar — pre-token protocols ranked by implied value

Snapshot as of 2026-11-14. The snapshot names 40 watchlist protocols: at least $50M of TVL, no token on record, and not a wrapped, staked or bridged product of a token that already trades. The brief's rule, read from the ten fields this snapshot carries, keeps 60; the extra ones are sub-protocols DefiLlama hangs off a parent, a field the ten omit. The snapshot's own list is the floor and the board covers it whole. The board ranks 198 pre-token protocols by what their launch would be worth.

## The value model

The multiple that turns a protocol's TVL into an implied token value is read from the 128 protocols in this same snapshot that already trade a token. The core is a log-log fit of market-cap-to-TVL against TVL — the market's own size effect — corrected by each category's typical residual from that fit, shrunk toward zero by how few live comparables the category has. It is not a fixed constant and no protocol name is special-cased.

- fit(TVL) = 10^(3.0247 + -0.4777 * log10(tvl_usd))
- multiple = fit(TVL) * (category multiple / fit(TVL))^w,  w = n / (n + 30)
- out-of-sample error (leave-one-out over 128 live protocols): 1.19006 median absolute log error
- against the size fit alone (1.2234): the category correction moves it by 2.7249%
- against a single fixed multiple (0.2138x): 1.62326, so the calibration cuts the typical miss by 26.68685%

A prediction is a model, not a price. The out-of-sample error above is the honest size of the miss to expect.

## The board

| # | Protocol | Category | TVL | 7d | Age | Implied value | Farm net $/hr |
|--:|---|---|--:|--:|--:|--:|--:|
| 1 | Steakhouse Financial | Risk Curators | $2,753,981,495 | -2.2% | 543d | $75,675,811 | 21021.06 |
| 2 | Sentora Curator | Risk Curators | $2,757,585,593 | +2.4% | 407d | $72,696,040 | 20193.34 |
| 3 | Gauntlet | Risk Curators | $1,577,685,462 | +5.6% | 543d | $58,799,604 | 16333.22 |
| 4 | Veda | Onchain Capital Allocator | $1,563,415,482 | -8.3% | 632d | $48,440,676 | 13455.74 |
| 5 | USDD | CDP | $1,055,793,606 | -2.8% | 611d | $43,276,555 | 12021.27 |
| 6 | Polymarket International | Prediction Market | $320,193,439 | -1.1% | 1845d | $35,954,630 | 9987.4 |
| 7 | Upshift | Onchain Capital Allocator | $499,083,733 | +8.3% | 710d | $29,977,282 | 8327.02 |
| 8 | OnRe | RWA | $308,882,355 | +0.1% | 488d | $24,749,852 | 6874.96 |
| 9 | OpenTrade | RWA | $241,501,527 | -1.6% | 708d | $23,794,042 | 6609.46 |
| 10 | Nonce Capital | Risk Curators | $513,783,671 | -9.7% | 45d | $23,378,796 | 4495.92 |
| 11 | Symbiotic | Collateral Markets | $253,923,299 | -12.0% | 886d | $22,527,854 | 6257.74 |
| 12 | Plume Vaults | RWA | $211,537,977 | -3.1% | 749d | $22,416,691 | 6226.86 |
| 13 | CIAN Yield Layer | Yield Aggregator | $280,281,384 | +4.7% | 726d | $21,913,759 | 6087.16 |
| 14 | Hive Protocol | Chain | $198,776,765 | -10.2% | 925d | $21,693,249 | 6025.9 |
| 15 | BitFi Basis | Basis Trading | $214,934,379 | -10.3% | 638d | $21,081,607 | 5856 |
| 16 | RockawayX | Risk Curators | $292,506,628 | -2.5% | 233d | $20,101,688 | 4568.57 |
| 17 | Hyperithm | Risk Curators | $221,638,535 | -4.4% | 543d | $20,077,380 | 5577.05 |
| 18 | Bittensor dTAO | Dexs | $376,026,255 | -6.6% | 56d | $19,836,503 | 3814.71 |
| 19 | K3 Capital | Risk Curators | $207,711,162 | -8.9% | 543d | $18,951,441 | 5264.29 |
| 20 | Defi Saver Asset Management | CDP Manager | $276,366,296 | -19.6% | n/a | $17,934,549 | 4981.82 |
| 21 | Lofty | RWA | $101,135,900 | +0.0% | 1563d | $17,730,896 | 4925.25 |
| 22 | R25 | RWA | $198,206,607 | +0.3% | 199d | $16,972,119 | 3857.3 |
| 23 | Clearstar | Risk Curators | $161,773,491 | -10.1% | 543d | $16,531,518 | 4592.09 |
| 24 | Figure Markets Prime | Lending | $190,506,995 | +18.0% | 474d | $15,689,298 | 4358.14 |
| 25 | Lightning Network | Payments | $217,862,346 | -10.1% | n/a | $15,484,354 | 4301.21 |

Rows beyond the top 25 are in board.json and on the dashboard.

## How to read a farm plan

Every row carries 3 to 12 steps with a cost and a time. The net $/hr column is the implied value times an assumed 0.05% share for one wallet, over the hours the plan asks for. That share is an assumption, stated so two protocols can be compared, never a promise: a protocol may never issue a token, and its record says so.
