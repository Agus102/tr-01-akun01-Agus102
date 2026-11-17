# Token Radar — pre-token protocols ranked by implied value

Snapshot as of 2026-11-14. The watchlist holds 40 protocols: at least $50M of TVL, no token on record. The board ranks 200 pre-token protocols by what their launch would be worth.

## The value model

The multiple that turns a protocol's TVL into an implied token value is read from the 128 protocols in this same snapshot that already trade a token: a log-log fit of market-cap-to-TVL against TVL. It is not a fixed constant and no protocol name is special-cased.

- multiple = 10^(3.0247 + -0.4777 * log10(tvl_usd))
- out-of-sample error (leave-one-out over 128 live protocols): 1.2234 median absolute log error
- against a single fixed multiple (0.2138x): 1.62326, so the calibration cuts the typical miss by 24.63318%

A prediction is a model, not a price. The out-of-sample error above is the honest size of the miss to expect.

## The board

| # | Protocol | Category | TVL | 7d | Age | Implied value | Farm net $/hr |
|--:|---|---|--:|--:|--:|--:|--:|
| 1 | Steakhouse Financial | Risk Curators | $2,753,981,495 | -2.2% | 543d | $71,161,725 | 19767.15 |
| 2 | Gauntlet | Risk Curators | $1,577,685,462 | +5.6% | 543d | $55,305,310 | 15362.59 |
| 3 | Veda | Onchain Capital Allocator | $1,563,415,482 | -8.3% | 632d | $53,403,308 | 14834.25 |
| 4 | USDD | CDP | $1,055,793,606 | -2.8% | 611d | $44,334,718 | 12315.2 |
| 5 | Upshift | Onchain Capital Allocator | $499,083,733 | +8.3% | 710d | $33,058,891 | 9183.03 |
| 6 | Symbiotic | Collateral Markets | $253,923,299 | -12.0% | 886d | $22,527,999 | 6257.78 |
| 7 | OnRe | RWA | $308,882,355 | +0.1% | 488d | $22,385,230 | 6218.12 |
| 8 | Nonce Capital | Risk Curators | $513,783,671 | -9.7% | 45d | $21,990,022 | 4228.85 |
| 9 | OpenTrade | RWA | $241,501,527 | -1.6% | 708d | $21,528,259 | 5980.07 |
| 10 | Hive Protocol | Chain | $198,776,765 | -10.2% | 925d | $20,327,749 | 5646.6 |
| 11 | Plume Vaults | RWA | $211,537,977 | -3.1% | 749d | $20,291,315 | 5636.48 |
| 12 | Bittensor dTAO | Dexs | $376,026,255 | -6.6% | 56d | $19,118,039 | 3676.55 |
| 13 | RockawayX | Risk Curators | $292,506,628 | -2.5% | 233d | $18,899,178 | 4295.27 |
| 14 | Hyperithm | Risk Curators | $221,638,535 | -4.4% | 543d | $18,875,865 | 5243.3 |
| 15 | K3 Capital | Risk Curators | $207,711,162 | -8.9% | 543d | $17,824,504 | 4951.25 |
| 16 | Lightning Network | Payments | $217,862,346 | -10.1% | n/a | $16,676,799 | 4632.44 |
| 17 | Lagoon | Onchain Capital Allocator | $151,263,522 | -3.3% | 691d | $16,599,850 | 4611.07 |
| 18 | Lofty | RWA | $101,135,900 | +0.0% | 1563d | $16,047,721 | 4457.7 |
| 19 | b14g | Restaking | $173,941,404 | -28.5% | 694d | $15,585,271 | 4329.24 |
| 20 | Clearstar | Risk Curators | $161,773,491 | -10.1% | 543d | $15,545,640 | 4318.23 |
| 21 | R25 | RWA | $198,206,607 | +0.3% | 199d | $15,361,637 | 3491.28 |
| 22 | Curvance | Lending | $136,345,059 | +0.7% | 352d | $13,710,816 | 3116.09 |
| 23 | Saturn | Stablecoin Wrapper | $154,313,682 | -0.7% | 219d | $13,554,223 | 3080.51 |
| 24 | Galaxy Curation | Risk Curators | $129,994,276 | +11.2% | 177d | $12,841,815 | 2469.58 |
| 25 | Tydro | Lending | $111,314,194 | -4.9% | 394d | $12,243,120 | 3400.87 |

Rows beyond the top 25 are in board.json and on the dashboard.

## How to read a farm plan

Every row carries 3 to 12 steps with a cost and a time. The net $/hr column is the implied value times an assumed 0.05% share for one wallet, over the hours the plan asks for. That share is an assumption, stated so two protocols can be compared, never a promise: a protocol may never issue a token, and its record says so.
