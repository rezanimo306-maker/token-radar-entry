# Token Radar (radar-2)

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

## The value model (radar-2)

Every row is scored by one function of the snapshot's own figures; no protocol
name is ever special-cased:

```
implied = round( tvl_usd x 0.3
  x (1 + clamp(change_7d, -60, 150) / 100 x 0.8)
  x (0.55 + min(age_days, 1460) / 1460 x 0.45) )
```

- **TVL anchors the value.** A protocol holding ten times the value is worth
  roughly ten times as much.
- **Seven-day growth moves it.** A protocol whose TVL rose 100% in seven days
  scores about 1.8x a flat one; one that fell 60% scores about half.
- **Tenure moves it.** A protocol that has run years with no token scores about
  1.8x one that appeared last month, because a long record with no token is the
  rarer signal. An unlisted age counts as one year.

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
