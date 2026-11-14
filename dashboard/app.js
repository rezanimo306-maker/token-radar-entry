// Token Radar — the board's second draft.
//
// The page reads window.RADAR (written beside dashboard/ by main.ts) and turns it
// into a ranked, filterable board plus one detail drawer per protocol. Everything
// it shows comes from data.js; the page never reaches the network, the clock or
// any other source, so what you see is exactly what the snapshot says.
//
// The farm plan and the implied value are the same arithmetic main.ts writes into
// board.json: the drawer recomputes a row from the snapshot figures and prints the
// number board.json carries, so the page and the board visibly agree.
(function () {
  'use strict';

  const RADAR = window.RADAR;
  if (!RADAR) return;

  const mount = document.getElementById('board');

  // What the reader is looking at right now: the search text, the filters, which
  // tab is open, how the table is sorted, and which drawer (if any) is open.
  // The same keys live in the URL hash, so a view can be linked or screenshotted.
  const view = {
    query: '',
    category: 'all',
    chain: 'all',
    tab: 'pre-token',
    watchlistOnly: false,
    sortKey: 'implied',
    sortDesc: true,
    open: null,
  };

  const usdWhole = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

  // Short money: $582.3M, $748.4K, $42 — the same buckets the board's numbers use.
  function compactUsd(n) {
    if (n === null || n === undefined || !Number.isFinite(n)) return 'n/a';
    const a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usdWhole.format(n);
  }

  function signedPct(n) {
    if (n === null || n === undefined || !Number.isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  function ageLabel(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  function clampNum(x, lo, hi) {
    return Math.min(hi, Math.max(lo, x));
  }

  // The model's arithmetic, restated for the drawer: TVL times the launch
  // multiple, moved by seven-day growth, moved again by tenure with no token.
  function recomputeImplied(row) {
    const m = RADAR.model;
    const growth = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    const growthFactor = 1 + (clampNum(growth, m.growth_floor, m.growth_cap) / 100) * m.growth_weight;
    const age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    const tenure = m.maturity_floor + (clampNum(age, 0, m.maturity_days) / m.maturity_days) * m.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * m.base_multiple * growthFactor * tenure));
  }

  // A small element builder: h('div', { className: 'x', text: 'y' }, ...kids).
  // Props starting with "on" are listeners; "dataset" is an object of data-*;
  // anything else becomes an attribute, skipped when null. Children may be
  // nodes, strings (they become text, so names stay escaped) or arrays of either.
  function h(tag, props, ...kids) {
    const node = document.createElement(tag);
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (value === null || value === undefined) continue;
        if (key === 'className') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
        else node.setAttribute(key, value);
      }
    }
    for (const kid of kids.flat(1)) {
      if (kid === null || kid === undefined || kid === false) continue;
      node.append(kid);
    }
    return node;
  }

  // Enter or Space on a focused row or card opens its drawer, like a click.
  function onKeyActivate(event, fn) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fn();
    }
  }

  // The farm plan, as a rule table over the protocol's category. The first rule
  // whose keys appear in the category wins; the strings are the plan itself —
  // the same words board.json carries for the row, so the drawer and the board
  // never disagree about what to do, what it costs or how long it takes.
  function primaryChain(p) {
    return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain';
  }

  function stakeSize(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }

  function holdLength(ageDays) {
    if (ageDays === null || ageDays === undefined) return 30;
    if (ageDays < 180) return 60;
    if (ageDays < 365) return 45;
    return 30;
  }

  function gasLabel(chain) {
    const c = (chain || '').toLowerCase();
    if (c === 'ethereum') return 'about $8';
    if (c === 'solana') return 'about $0.05';
    return 'about $0.50';
  }

  const PLAN_RULES = [
    {
      keys: ['liquid restak'],
      primary: (p, stake, chain) => `Restake $${stake} of the chain's staking asset through ${p.name} on ${chain} and hold the receipt token.`,
      follow: () => 'Use the restaking receipt in a lending market or a liquidity pool so the position works twice.',
    },
    {
      keys: ['liquid stak'],
      primary: (p, stake, chain) => `Stake $${stake} of the chain's staking asset through ${p.name} on ${chain} and hold the liquid staking token.`,
      follow: () => 'Use the liquid staking token in a lending market or a liquidity pool instead of leaving it idle.',
    },
    {
      keys: ['lend', 'cdp', 'collateral'],
      primary: (p, stake, chain) => `Supply $${stake} of USDC to ${p.name} on ${chain} and keep the position open.`,
      follow: () => 'Borrow a small amount against the supply, then repay it, so the position shows both sides of the market.',
    },
    {
      keys: ['dex', 'leveraged farm'],
      primary: (p, stake, chain) => `Provide $${stake} of liquidity to ${p.name}'s main pool on ${chain} and keep the position open.`,
      follow: () => 'Swap $25 through the pool once, so the position shows a trade as well as liquidity.',
    },
    {
      keys: ['bridge'],
      primary: (p, stake, chain) => `Bridge $${stake} of USDC to ${chain} through ${p.name} and use the bridged funds in its app.`,
      follow: () => 'Bridge a second, smaller amount back the other way to show two-way use of the route.',
    },
    {
      keys: ['perpetual', 'derivative'],
      primary: (p, stake, chain) => `Deposit $${stake} of USDC as margin on ${p.name} on ${chain} and open one small hedge.`,
      follow: () => 'Close the hedge and open one more with a different size, keeping the margin in place.',
    },
    {
      keys: ['prediction'],
      primary: (p, stake) => `Fund $${stake} and place one market position on ${p.name}.`,
      follow: () => 'Place a second position on a different market to show repeat use.',
    },
    {
      keys: ['risk curator', 'curator', 'allocator'],
      primary: (p, stake, chain) => `Deposit $${stake} into a ${p.name} vault on ${chain} and keep the shares.`,
      follow: () => "Read the vault's allocation report and top the position up once.",
    },
    {
      keys: ['rwa'],
      primary: (p, stake, chain) => `Mint $${stake} of the protocol's yield-bearing asset on ${chain} and hold it.`,
      follow: () => 'Check the yield accrual on the asset and keep it held through one payout cycle.',
    },
    {
      keys: ['stable'],
      primary: (p, stake, chain) => `Mint or deposit $${stake} of the stable asset through ${p.name} on ${chain}.`,
      follow: () => 'Use the stable asset in one pool or payment so it circulates.',
    },
    {
      keys: ['insurance'],
      primary: (p, stake, chain) => `Buy $${stake} of cover from ${p.name} on ${chain} and keep the policy active.`,
      follow: () => 'Read the claims process and keep the policy through one renewal check.',
    },
    {
      keys: ['yield'],
      primary: (p, stake, chain) => `Deposit $${stake} into ${p.name}'s main yield vault on ${chain} and let it compound.`,
      follow: () => "Harvest or compound the vault's yield once, then leave the position running.",
    },
  ];

  function planRule(p) {
    const cat = (p.category || '').toLowerCase();
    for (const rule of PLAN_RULES) {
      if (rule.keys.some((k) => cat.includes(k))) return rule;
    }
    return {
      primary: (q, stake, chain) => `Deposit $${stake} of USDC into ${q.name} on ${chain} and keep the position open.`,
      follow: () => 'Make a second, smaller deposit to the same position to show repeat use.',
    };
  }

  // The chains that share one EVM wallet, lowercased: the rest either have their
  // own wallet below or fall back to a plain one. Mirrors lib/model.ts exactly,
  // so the drawer prints the same steps board.json carries.
  const EVM_CHAINS = new Set([
    'ethereum', 'base', 'arbitrum', 'polygon', 'binance', 'avalanche', 'optimism', 'ink',
    'flare', 'monad', 'plasma', 'arc', 'mantle', 'zksync era', 'morph', 'stable', 'rsk',
    'mezo', 'manta', 'pharos', 'world chain', 'tempo', 'reya network', 'rise',
    'robinhood chain', 'hyperliquid l1', 'bsquared', 'xdai', 'cronos',
  ]);

  function chainKind(chain) {
    const c = chain.toLowerCase();
    if (c === 'solana') return 'solana';
    if (c === 'bitcoin') return 'bitcoin';
    if (c === 'stellar') return 'stellar';
    if (c === 'sui') return 'sui';
    if (c === 'aptos') return 'aptos';
    if (c === 'tron') return 'tron';
    if (c === 'ripple') return 'ripple';
    if (c === 'algorand') return 'algorand';
    if (c === 'near') return 'near';
    if (c === 'ton') return 'ton';
    if (c === 'bittensor') return 'bittensor';
    if (EVM_CHAINS.has(c)) return 'evm';
    return 'other';
  }

  function setupStep(p, stake) {
    const chain = primaryChain(p);
    const kind = chainKind(chain);
    if (kind === 'solana') return `Set up a fresh Solana wallet with $${stake} of USDC and a little SOL for fees, and keep its seed phrase offline.`;
    if (kind === 'bitcoin') return `Set up a fresh Bitcoin wallet with $${stake} of USDC and a little BTC for fees, and keep its seed phrase offline.`;
    if (kind === 'stellar') return `Set up a fresh Stellar wallet with $${stake} of USDC and a little XLM for fees, and keep its seed phrase offline.`;
    if (kind === 'sui') return `Set up a fresh Sui wallet with $${stake} of USDC and a little SUI for fees, and keep its seed phrase offline.`;
    if (kind === 'aptos') return `Set up a fresh Aptos wallet with $${stake} of USDC and a little APT for fees, and keep its seed phrase offline.`;
    if (kind === 'tron') return `Set up a fresh Tron wallet with $${stake} of USDC and a little TRX for fees, and keep its seed phrase offline.`;
    if (kind === 'ripple') return `Set up a fresh XRP Ledger wallet with $${stake} of USDC and a little XRP for fees, and keep its seed phrase offline.`;
    if (kind === 'algorand') return `Set up a fresh Algorand wallet with $${stake} of USDC and a little ALGO for fees, and keep its seed phrase offline.`;
    if (kind === 'near') return `Set up a fresh NEAR wallet with $${stake} of USDC and a little NEAR for fees, and keep its seed phrase offline.`;
    if (kind === 'ton') return `Set up a fresh TON wallet with $${stake} of USDC and a little TON for fees, and keep its seed phrase offline.`;
    if (kind === 'bittensor') return `Set up a fresh Bittensor wallet with $${stake} of USDC and a little TAO for fees, and keep its seed phrase offline.`;
    if (kind === 'evm') return `Set up a fresh EVM wallet on ${chain} with $${stake} of USDC and a little native gas, and keep its seed phrase offline.`;
    return `Set up a fresh wallet on ${chain} with $${stake} of USDC and a little native gas, and keep its seed phrase offline.`;
  }

  function weeklyTopUp(stake) {
    if (stake >= 150) return 50;
    if (stake >= 100) return 25;
    return 10;
  }

  function weeklyAction(p, top) {
    const c = (p.category || '').toLowerCase();
    const name = p.name;
    if (c.includes('liquid restak')) return { text: `Each week, check the restaking yield on ${name} and restake the rewards so the receipt keeps compounding.`, topUp: false };
    if (c.includes('liquid stak')) return { text: `Each week, check the staking yield on ${name} and restake the rewards instead of letting them sit.`, topUp: false };
    if (c.includes('restaking')) return { text: `Each week, check the restaking rewards on ${name} and restake them once.`, topUp: false };
    if (c.includes('cdp manager')) return { text: `Each week, check the CDP health on ${name} and top up the collateral $${top} if the ratio slipped.`, topUp: true };
    if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('uncollateralized lending')) return { text: `Each week, check the borrow rate on ${name} and repay or top up $${top} to keep the position healthy.`, topUp: true };
    if (c.includes('indexes')) return { text: `Each week, check the index rebalance on ${name} and keep the position through it.`, topUp: false };
    if (c.includes('dexs') || c.includes('leveraged farm')) return { text: `Each week, check the fees ${name}'s main pool earned and rebalance the range once if the price moved.`, topUp: false };
    if (c.includes('bridge')) return { text: `Each week, bridge $${top} through ${name} so the route shows steady two-way use.`, topUp: true };
    if (c.includes('perpetual') || c.includes('derivative')) return { text: `Each week, check the open hedge on ${name} and roll it once if the funding rate flipped.`, topUp: false };
    if (c.includes('prediction')) return { text: `Each week, check the open markets on ${name} and close one position or open a new one.`, topUp: false };
    if (c.includes('risk curator') || c.includes('curator') || c.includes('allocator')) return { text: `Each week, read ${name}'s new allocation report and top the position up $${top} if the mix changed.`, topUp: true };
    if (c.includes('rwa')) return { text: `Each week, check the yield payout on ${name}'s asset and keep it held through the payout.`, topUp: false };
    if (c.includes('stable')) return { text: `Each week, check the peg on ${name}'s stable asset and use it in one pool so it circulates.`, topUp: false };
    if (c.includes('insurance')) return { text: `Each week, check the cover on ${name} and keep the policy active through its renewal check.`, topUp: false };
    if (c.includes('yield')) return { text: `Each week, check the vault yield on ${name} and harvest or compound the yield once.`, topUp: false };
    if (c.includes('basis trading')) return { text: `Each week, check the funding on ${name}'s basis trade and roll the position once if the spread narrowed.`, topUp: false };
    if (c.includes('staking pool')) return { text: `Each week, check the staking rewards on ${name} and restake them once.`, topUp: false };
    if (c.includes('liquidity manager')) return { text: `Each week, check the managed range on ${name} and let it rebalance once if the price moved.`, topUp: false };
    if (c.includes('farm')) return { text: `Each week, harvest the farm rewards on ${name} once and re-deposit them.`, topUp: false };
    if (c.includes('anchor btc') || c.includes('decentralized btc')) return { text: `Each week, check the BTC backing on ${name} and keep the position held one more week.`, topUp: false };
    if (c.includes('cedefi')) return { text: `Each week, check the CeDeFi yield on ${name} and keep the deposit running.`, topUp: false };
    if (c.includes('payments') || c.includes('crypto card')) return { text: `Each week, make one payment through ${name} so the account shows steady use.`, topUp: false };
    if (c.includes('otc marketplace')) return { text: `Each week, check the listed OTC deals on ${name} and keep the position open.`, topUp: false };
    if (c.includes('governance incentives')) return { text: `Each week, vote once on ${name}'s governance and keep the stake locked.`, topUp: false };
    if (c.includes('chain')) return { text: `Each week, check the activity on ${name} and make one transaction to keep the wallet live.`, topUp: false };
    return { text: `Each week, make one qualifying action on ${name}, such as a deposit, a swap or a vote.`, topUp: false };
  }

  function claimStep(p) {
    const c = (p.category || '').toLowerCase();
    const name = p.name;
    if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('uncollateralized lending') || c.includes('cdp manager')) return `Before you withdraw, open ${name}'s rewards dashboard and claim only from the link it publishes.`;
    if (c.includes('rwa')) return `Before you withdraw, open ${name}'s yield page and claim only from the link it publishes.`;
    if (c.includes('yield')) return `Before you withdraw, open ${name}'s vault page and claim the yield only from the link it publishes.`;
    if (c.includes('dexs') || c.includes('leveraged farm')) return `Before you withdraw, open ${name}'s pool page and claim the fees only from the link it publishes.`;
    if (c.includes('risk curator') || c.includes('curator') || c.includes('allocator')) return `Before you withdraw, open ${name}'s vault page and claim only from the link it publishes.`;
    if (c.includes('prediction')) return `Before you withdraw, settle the open markets on ${name} and claim only from the link it publishes.`;
    if (c.includes('liquid stak') || c.includes('liquid restak') || c.includes('restaking') || c.includes('staking pool')) return `Before you withdraw, open ${name}'s staking page and claim the rewards only from the link it publishes.`;
    return `Before you withdraw, open ${name}'s own points page and claim only from the link it publishes.`;
  }

  function logStep(p, chain, hold) {
    return `After ${hold} days, write ${p.name} on ${chain}, the wallet, the dates and every transaction in a farm log, and plan the unwind before you need it.`;
  }

  // One step is { text, cost, time }; the board stores the joined sentence.
  function joinStep(step) {
    let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
    if (s.length > 600) s = `${s.slice(0, 596)}...`;
    if (s.length < 20) s += " Hold the position and check the protocol's own page.";
    return s;
  }

  function planSteps(p) {
    const chain = primaryChain(p);
    const stake = stakeSize(p);
    const hold = holdLength(p.age_days);
    const gas = gasLabel(chain);
    const rule = planRule(p);
    const top = weeklyTopUp(stake);
    const week = weeklyAction(p, top);
    return [
      { text: setupStep(p, stake), cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: rule.primary(p, stake, chain), cost: `$${stake} of capital and ${gas} of gas`, time: '15 minutes to set up' },
      { text: rule.follow(p), cost: `${gas} of gas`, time: '10 minutes' },
      { text: week.text, cost: week.topUp ? `about $${top} to top up and $2 of gas a week` : 'about $2 of gas a week', time: '10 minutes a week' },
      { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${stake} stays in the position`, time: `${hold} days` },
      { text: claimStep(p), cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: logStep(p, chain, hold), cost: 'nothing but the log', time: '5 minutes' },
    ].map(joinStep);
  }

  // The URL hash carries the view: #q=…&p=…&category=…&chain=…&tab=…
  // Reading it on load restores a linked view; writing it on every change keeps
  // the address bar honest without ever reloading the page.
  function readHash() {
    const raw = window.location.hash.replace(/^#/, '');
    if (!raw) return;
    const params = new URLSearchParams(raw);
    if (params.get('q')) view.query = params.get('q');
    if (params.get('p')) view.open = params.get('p');
    if (params.get('category')) view.category = params.get('category');
    if (params.get('chain')) view.chain = params.get('chain');
    if (params.get('tab')) view.tab = params.get('tab');
    if (params.get('w')) view.watchlistOnly = params.get('w') === '1';
  }

  function writeHash() {
    const params = new URLSearchParams();
    if (view.query) params.set('q', view.query);
    if (view.category !== 'all') params.set('category', view.category);
    if (view.chain !== 'all') params.set('chain', view.chain);
    if (view.tab !== 'pre-token') params.set('tab', view.tab);
    if (view.watchlistOnly) params.set('w', '1');
    if (view.open) params.set('p', view.open);
    const next = params.toString();
    const url = next ? `#${next}` : window.location.pathname + window.location.search;
    window.history.replaceState(null, '', url);
  }

  function visibleRows() {
    const q = view.query.trim().toLowerCase();
    return RADAR.rows.filter((r) => {
      if (view.watchlistOnly && !r.watchlist) return false;
      if (view.category !== 'all' && r.category !== view.category) return false;
      if (view.chain !== 'all' && !(r.chains || []).includes(view.chain)) return false;
      if (!q) return true;
      const hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  function sortValue(row, key) {
    if (key === 'name') return row.name.toLowerCase();
    if (key === 'tvl') return row.tvl_usd;
    if (key === 'growth') return row.change_7d === null ? -Infinity : row.change_7d;
    if (key === 'age') return row.age_days === null ? Infinity : row.age_days;
    return row.implied_value_usd;
  }

  function orderedRows(list) {
    const key = view.sortKey;
    const dir = view.sortDesc ? -1 : 1;
    return [...list].sort((a, b) => {
      const av = sortValue(a, key);
      const bv = sortValue(b, key);
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function buildHeader() {
    return h('div', { className: 'band' },
      h('div', { className: 'band-in' },
        h('div', { className: 'brand' },
          h('span', { className: 'mark' }),
          h('span', { className: 'brand-name', html: 'Token <em>Radar</em>' })),
        h('div', { className: 'band-meta' },
          h('span', { text: `Snapshot ${RADAR.as_of}` }),
          h('span', { text: 'DefiLlama protocol index' }),
          h('span', { text: `${RADAR.model_version} model` }))));
  }

  function buildIntro() {
    const total = RADAR.rows.reduce((n, r) => n + r.implied_value_usd, 0);
    const floorM = Math.round(RADAR.floor_usd / 1e6);
    return h('section', { className: 'lede' },
      h('div', null,
        h('h1', { text: `${RADAR.watchlist_size} watchlist protocols, ranked by implied value` }),
        h('p', { html: `The watchlist is the floor: every protocol with at least <b>$${floorM}M of TVL</b> and no token on record. The early radar adds <b>${RADAR.early_size} pre-token protocols</b> below that floor, so the board is the whole pre-token universe. Implied value is a model, not a promise.` })),
      h('div', { className: 'facts' },
        h('div', { className: 'fact' }, h('span', { text: 'Watchlist covered' }), h('b', { text: `${RADAR.watchlist_size} / ${RADAR.watchlist_size}` })),
        h('div', { className: 'fact' }, h('span', { text: 'Pre-token rows scored' }), h('b', { text: String(RADAR.board_size) })),
        h('div', { className: 'fact' }, h('span', { text: 'Early rows below the floor' }), h('b', { text: String(RADAR.early_size) })),
        h('div', { className: 'fact' }, h('span', { text: 'Total implied value' }), h('b', { text: compactUsd(total) }))));
  }

  function buildTopThree() {
    const cards = RADAR.rows.slice(0, 3).map((r, i) =>
      h('article', {
        className: `leader${i === 0 ? ' first' : ''}`,
        tabindex: '0',
        onclick: () => openDrawer(r.slug),
        onkeydown: (e) => onKeyActivate(e, () => openDrawer(r.slug)),
      },
        h('span', { className: 'rank', text: i === 0 ? 'Rank 1 — most valuable' : `Rank ${r.rank}` }),
        h('b', { text: r.name }),
        h('span', { className: 'value', text: compactUsd(r.implied_value_usd) }),
        h('span', { className: 'sub', text: `TVL ${compactUsd(r.tvl_usd)} · 7d ${signedPct(r.change_7d)} · ${r.category || 'Other'}` })));
    return h('section', { className: 'leaders' }, cards);
  }

  function buildFilters() {
    const categories = [...new Set(RADAR.rows.map((r) => r.category || 'Other'))].sort();
    const chains = [...new Set(RADAR.rows.flatMap((r) => r.chains || []))].sort();

    const search = h('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: view.query, 'aria-label': 'Search the board' });
    search.addEventListener('input', () => { view.query = search.value; writeHash(); paint(); });

    const cat = h('select', { id: 'category', 'aria-label': 'Filter by category' },
      h('option', { value: 'all', text: 'All categories' }),
      categories.map((c) => h('option', { value: c, text: c, selected: c === view.category ? 'selected' : null })));
    cat.addEventListener('change', () => { view.category = cat.value; writeHash(); paint(); });

    const ch = h('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      h('option', { value: 'all', text: 'All chains' }),
      chains.map((c) => h('option', { value: c, text: c, selected: c === view.chain ? 'selected' : null })));
    ch.addEventListener('change', () => { view.chain = ch.value; writeHash(); paint(); });

    const preBtn = h('button', { type: 'button', 'aria-pressed': view.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: () => { view.tab = 'pre-token'; paint(); } });
    const liveBtn = h('button', { type: 'button', 'aria-pressed': view.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: () => { view.tab = 'live'; paint(); } });

    // The watchlist-only filter, next to the tabs: one click shows the 40 watchlist
    // rows and nothing else. It only applies to the pre-token table, so it is
    // disabled while the live-token tab is open.
    const wl = h('input', { type: 'checkbox', id: 'watchlist-only', checked: view.watchlistOnly ? 'checked' : null, disabled: view.tab === 'live' ? 'disabled' : null, 'aria-label': 'Show only the watchlist' });
    wl.addEventListener('change', () => { view.watchlistOnly = wl.checked; writeHash(); paint(); });
    const wlField = h('label', { className: 'check', for: 'watchlist-only' }, wl, ' Watchlist only');

    const shown = view.tab === 'pre-token'
      ? `${visibleRows().length} rows shown`
      : `${RADAR.live.length} live-token protocols`;
    return h('div', { className: 'controls' },
      h('div', { className: 'field' }, h('label', { for: 'q', text: 'Search' }), search),
      h('div', { className: 'field' }, h('label', { for: 'category', text: 'Category' }), cat),
      h('div', { className: 'field' }, h('label', { for: 'chain', text: 'Chain' }), ch),
      h('div', { className: 'field' }, h('span', { className: 'sub', text: 'Token status' }), h('div', { className: 'tabs' }, preBtn, liveBtn)),
      wlField,
      h('span', { className: 'count', text: shown }));
  }

  function sortButton(key, label) {
    const arrow = view.sortKey === key
      ? h('span', { 'aria-hidden': 'true', text: view.sortDesc ? ' v' : ' ^' })
      : null;
    return h('th', { scope: 'col' },
      h('button', {
        type: 'button',
        onclick: () => {
          if (view.sortKey === key) view.sortDesc = !view.sortDesc;
          else { view.sortKey = key; view.sortDesc = true; }
          paint();
        },
      }, label, arrow));
  }

  function rowChains(r) {
    return r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain';
  }

  // The drawer's chain summary: the first three chains and how many more there
  // are, so a protocol on forty chains does not push the farm plan below the fold.
  function drawerChains(r) {
    if (!r.chains || !r.chains.length) return 'an unnamed chain';
    if (r.chains.length <= 3) return r.chains.join(', ');
    return `${r.chains.slice(0, 3).join(', ')} and ${r.chains.length - 3} more`;
  }

  function boardTable() {
    const list = orderedRows(visibleRows());
    if (list.length === 0) {
      return h('div', { className: 'panel' },
        h('div', { className: 'empty' },
          h('h2', { text: 'No protocol matches that filter' }),
          h('p', { text: 'Clear the search or pick another category to see the board again.' }),
          h('button', {
            className: 'button primary', type: 'button', text: 'Clear filters',
            onclick: () => { view.query = ''; view.category = 'all'; view.chain = 'all'; writeHash(); paint(); },
          })));
    }
    const scale = list[0].implied_value_usd || 1;
    const body = h('tbody');
    for (const r of list) {
      const growth = r.change_7d === null ? 'n/a' : signedPct(r.change_7d);
      const growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      const width = Math.max(3, Math.round((r.implied_value_usd / scale) * 100));
      body.append(h('tr', {
        'data-selected': view.open === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: () => openDrawer(r.slug),
        onkeydown: (e) => onKeyActivate(e, () => openDrawer(r.slug)),
      },
        h('td', { className: 'num', text: String(r.rank) }),
        h('td', null, h('div', { className: 'name' },
          h('b', { text: r.name }),
          h('span', { className: 'sub', text: `${r.category || 'Other'} on ${rowChains(r)}` }))),
        h('td', { className: 'num', text: compactUsd(r.tvl_usd) }),
        h('td', { className: ['num', growthClass].filter(Boolean).join(' '), text: growth }),
        h('td', { className: 'num', text: ageLabel(r.age_days) }),
        h('td', null, h('div', { className: 'implied' },
          h('div', { className: 'bar', 'aria-hidden': 'true' }, h('i', { style: `width:${width}%` })),
          h('span', { className: 'num', text: compactUsd(r.implied_value_usd) }))),
        h('td', null, h('span', { className: 'status', text: 'no token' }))));
    }
    return h('div', { className: 'panel' },
      h('div', { className: 'table-wrap' },
        h('table', null,
          h('caption', { className: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          h('thead', null, h('tr', null,
            sortButton('implied', 'Rank'),
            sortButton('name', 'Protocol'),
            sortButton('tvl', 'TVL'),
            sortButton('growth', '7d'),
            sortButton('age', 'Age'),
            sortButton('implied', 'Implied value'),
            h('th', { scope: 'col', text: 'Token' }))),
          body)));
  }

  function liveTable() {
    const body = h('tbody');
    for (const r of RADAR.live) {
      const dir = r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg';
      body.append(h('tr', null,
        h('td', { className: 'num', text: 'live' }),
        h('td', null, h('div', { className: 'name' },
          h('b', { text: r.name }),
          h('span', { className: 'sub', text: `${r.category || 'Other'} on ${rowChains(r)}` }))),
        h('td', { className: 'num', text: compactUsd(r.tvl_usd) }),
        h('td', { className: `num ${dir}`, text: signedPct(r.change_7d) }),
        h('td', { className: 'num', text: compactUsd(r.mcap_usd) }),
        h('td', null, h('span', { className: 'status live', text: 'already trades' }))));
    }
    return h('div', { className: 'panel' },
      h('div', { className: 'table-wrap' },
        h('table', null,
          h('caption', { className: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          h('thead', null, h('tr', null,
            h('th', { scope: 'col', text: 'Status' }),
            h('th', { scope: 'col', text: 'Protocol' }),
            h('th', { scope: 'col', text: 'TVL' }),
            h('th', { scope: 'col', text: '7d' }),
            h('th', { scope: 'col', text: 'Market cap' }),
            h('th', { scope: 'col', text: 'Token' }))),
          body)));
  }

  function methodPanel() {
    const m = RADAR.model;
    const formula = `implied = round( tvl_usd x ${m.base_multiple} x (1 + clamp(change_7d, ${m.growth_floor}, ${m.growth_cap}) / 100 x ${m.growth_weight}) x (${m.maturity_floor} + min(age_days, ${m.maturity_days}) / ${m.maturity_days} x ${m.maturity_range}) )`;
    return h('section', { className: 'panel model' },
      h('h2', { text: 'How implied value is computed' }),
      h('p', { className: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      h('div', { className: 'formula', text: formula }),
      h('p', { className: 'sub', text: `TVL anchors the value, seven-day growth moves it, and age with no token moves it: a protocol that has run years with no token is the rarer signal. An unlisted age uses ${m.unknown_age_days} days. The early radar is every pre-token protocol the snapshot carries, and the live-token protocols are set aside with their market caps shown.` }));
  }

  const drawer = h('dialog', { className: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  drawer.addEventListener('close', () => { view.open = null; writeHash(); });

  function openDrawer(slug) {
    const row = RADAR.rows.find((r) => r.slug === slug);
    if (!row) return;
    view.open = slug;
    writeHash();
    drawer.textContent = '';
    const steps = planSteps(row);
    const recomputed = recomputeImplied(row);
    const agrees = recomputed === row.implied_value_usd;
    drawer.append(
      h('div', { className: 'detail-head' },
        h('div', null,
          h('span', { className: 'brand-name', text: `Rank ${row.rank} of ${RADAR.board_size}` }),
          h('h2', { id: 'detail-title', text: row.name }),
          h('p', { className: 'sub', text: `${row.category || 'Other'} on ${drawerChains(row)}` })),
        h('button', { className: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: () => drawer.close() })),
      h('section', { className: 'detail-section' },
        h('h3', { text: 'Implied value' }),
        h('div', { className: 'equation' },
          h('div', null, h('span', { text: 'TVL' }), h('b', { className: 'num', text: compactUsd(row.tvl_usd) })),
          h('div', null, h('span', { text: 'Seven-day growth' }), h('b', { className: 'num', text: signedPct(row.change_7d) })),
          h('div', null, h('span', { text: 'Age with no token' }), h('b', { className: 'num', text: ageLabel(row.age_days) })),
          h('div', null, h('span', { text: 'Growth multiplier' }), h('b', { className: 'num', text: String(row.growth_multiplier) })),
          h('div', null, h('span', { text: 'Maturity multiplier' }), h('b', { className: 'num', text: String(row.maturity_multiplier) })),
          h('div', null, h('span', { text: 'Implied value' }), h('b', { className: 'num', text: compactUsd(row.implied_value_usd) }))),
        h('p', { className: 'sub', text: `Model ${RADAR.model_version} scores every protocol the same way. Recomputed here as ${compactUsd(recomputed)}${agrees ? ' — the same number board.json carries.' : ' — which differs from the board.'} An estimate, not a price.` })),
      h('section', { className: 'detail-section' },
        h('h3', { text: 'Farm plan' }),
        h('ol', { className: 'steps' }, steps.map((s) => {
          const at = s.indexOf(' Cost: ');
          const action = at >= 0 ? s.slice(0, at) : s;
          const tail = at >= 0 ? s.slice(at + 1) : '';
          return h('li', null, h('b', { text: action }), h('span', { className: 'cost', text: tail }));
        }))));
    if (typeof drawer.showModal === 'function') {
      if (!drawer.open) drawer.showModal();
    } else {
      drawer.setAttribute('open', '');
    }
  }

  function paint() {
    mount.textContent = '';
    mount.append(buildHeader());
    const shell = h('div', { className: 'shell' });
    shell.append(buildIntro(), buildTopThree(), buildFilters());
    shell.append(view.tab === 'pre-token' ? boardTable() : liveTable());
    if (view.tab === 'pre-token') shell.append(methodPanel());
    shell.append(h('p', { className: 'footnote', text: 'Implied value is the entry’s own claim from the snapshot’s figures; it does not predict whether or when a token is issued. Farm plans never promise a token: they say what to do, what it costs and how long it takes.' }));
    mount.append(shell);
    mount.setAttribute('aria-busy', 'false');
    if (!drawer.isConnected) mount.append(drawer);
    if (view.open) openDrawer(view.open);
  }

  readHash();
  paint();
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.open) drawer.close();
  });
})();
