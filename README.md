# Token Radar (radar-4)

![make.fun](https://img.shields.io/badge/make.fun-token--radar--01-blue) ![model](https://img.shields.io/badge/model-radar--4-green) ![Node](https://img.shields.io/badge/node-22-brightgreen)

A token launch radar: it ranks every pre-token protocol in a DefiLlama snapshot by
an implied value, and shows a reader how to farm each one. Built for
make.fun's `token-radar-01` bounty (Node 22, standard library only).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

It reads `/input/snapshot.json` (or `--input`), writes `/output/board.json`,
`/output/data.js`, copies `dashboard/` and `screenshots/` to `/output`, and writes
`/output/dossier.json` with the vendored `vendor/makefun-board.ts`. Run it twice:
both runs write the same bytes.

## The value model (radar-4)

Every row is scored by one function of the snapshot's own figures; no protocol
name is ever special-cased:

```
curve      = 10 ^ (a + b x log10(tvl_usd))   (a, b fitted at run time)
implied    = round( curve
  x 10 ^ category_log_residual
  x (1 + clamp(change_7d, -60, 150) / 100 x 0.5)
  x (0.7 + min(age_days, 1460) / 1460 x 0.3)
  x (1 + 0.02 x min(chains - 1, 8)) )
```

- **The size curve carries the ranking.** The market does not pay a fixed
  fraction of TVL: among the snapshot's live-token protocols the median
  market-cap-to-TVL falls from 0.42x at $5–50M of TVL to 0.03x above $1B, so a
  flat multiple overvalues the giants and undervalues the small. The curve is
  an OLS fit of log10(market cap) on log10(TVL) over the live-token comps
  (exchange tokens left out), computed at run time.
- **Category is the market's own pricing.** Each category's median log residual
  against the curve, at least three live protocols to count, clamped to ±0.6
  dex, else 1.00x.
- **Seven-day growth moves it.** A protocol whose TVL rose 100% in seven days
  scores about 1.5x a flat one; one that fell 60% scores about 0.7x.
- **Tenure moves it.** A protocol that has run four years with no token scores
  about 1.4x one that appeared last month, because a long record with no token
  is the rarer signal. An unlisted age counts as one year.
- **Growth and age are priors, not fitted.** Among the live comps neither
  predicts the multiple (r ≈ −0.07 and −0.11), so they tilt the value, never
  drive it.
- **Tested out of sample.** Fit on live comps listed before 2024-06-01,
  predicted on the ones listed after: the size curve's median error is 2.25x
  with 50% of predictions within 2x, against the flat multiple's 4.48x and
  25% on the same split. The dashboard recomputes these numbers from the
  snapshot at run time.

## The board

- **198 rows**: all 40 watchlist protocols (the floor) plus every other protocol
  the watchlist's own rule keeps. Wrapped, staked, bridged and exchange
  products are left out: their token already trades, so there is no launch to
  rank. The watchlist is a floor, never a ceiling.
- **Live-token protocols are set aside** in their own tab with their market caps:
  their value is a market fact, not a model.
- **Farm plans** (7 steps each) are derived from the protocol's category,
  chains, TVL and age: the main action, a second qualifying action, a weekly
  cadence, a hold period, a points check and a farm log. Each step states its
  cost (capital and chain-specific gas: Ethereum ~$8, Solana ~$0.05, other
  chains ~$0.50) and its time. No plan promises a token.

## The dashboard

`dashboard/index.html` + `app.css` + `app.js`, no network, no framework. It
renders the ranked board, a top-3 leaders strip, search, category and chain
filters, sortable columns, a live-token tab, and a detail drawer for every
protocol with the model's own inputs and its farm plan. The page recomputes a
row's implied value from the snapshot figures and checks it against the number
`board.json` carries.

## Screenshots

Three real screenshots of the dashboard, taken in a headless browser at
1440x900: the board, a protocol's detail view, and a filtered view.
