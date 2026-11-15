// Token Radar's value model (radar-3): one sealed snapshot in, one ranked board out.
//
// The board ranks every rankable pre-token protocol in the snapshot. The 40 watchlist slugs are
// the floor, never the ceiling: every other protocol the watchlist's own rule keeps joins them,
// so the radar covers the whole pre-token universe instead of a shortlist. A protocol counts as
// pre-token when its record carries no token at all — no market cap, no CoinGecko id, no symbol.
// Wrapped, staked, bridged and exchange products are left out by that same rule, because their
// token already trades and there is no launch left to rank. The live-token protocols are kept
// apart in their own view with their market caps, never mixed into the ranking: their value is
// a market fact, not a model.
//
// Implied value follows only from the snapshot's own figures, the same function for every row:
//
//   base       = tvl_usd x BASE_MULTIPLE
//   category   = the category's median market-cap-to-TVL among the snapshot's live-token
//                protocols, over the live median overall, clamped to [0.5, 2.0]; 1.0 when
//                the category has fewer than three live protocols to learn from
//   chain      = 1 + 0.02 x min(chains - 1, 8): a protocol on more chains reaches more
//                users, capped at 1.16
//   growth     = clamp(change_7d, -60, 150) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = MATURITY_FLOOR
//                + min(age_days, MATURITY_DAYS) / MATURITY_DAYS x MATURITY_RANGE
//   implied    = max(1, round(base x category x growthMult x maturity x chain))
//
// TVL anchors the value: a protocol holding ten times the value is worth roughly ten times as
// much. The category term is the market's own pricing, read from the snapshot: live DEX tokens
// trade near 0.34x their TVL while live lending tokens trade near 0.13x, so a pre-token DEX is
// worth more than a pre-token lender at the same TVL. Growth moves it: a protocol whose TVL rose
// 100% in seven days scores about 1.8x a flat one, and one that fell 60% scores about half.
// Tenure moves it: a protocol that has run three years with no token scores about 1.8x one that
// appeared last month, because a long record with no token is the rarer signal. Reach moves it
// a little: a protocol on many chains is worth up to 1.16x one on a single chain. No protocol
// name is ever special-cased, and no category multiple is ever written by hand: the category
// table is computed from the snapshot's live-token protocols at run time. Age is the days since
// the snapshot first listed the protocol; an unlisted age counts as one year.
//
// The file is written so the whole model is pure: nothing here reads the clock, the network or
// a random source, so the same snapshot always builds the same board, byte for byte.

/** One protocol entry of the sealed snapshot: exactly its ten fields. */
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

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  /** Live-token protocols a category needs before its own multiple counts. */
  category_min_live: number;
  /** The category factor's band: how far one category may tilt the base multiple. */
  category_factor_floor: number;
  category_factor_cap: number;
  /** What one extra chain adds to the value, and how many extra chains count. */
  chain_per_extra: number;
  chain_cap_extra: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.3,
  growth_weight: 0.8,
  growth_floor: -60,
  growth_cap: 150,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1460,
  unknown_age_days: 365,
  category_min_live: 3,
  category_factor_floor: 0.5,
  category_factor_cap: 2.0,
  chain_per_extra: 0.02,
  chain_cap_extra: 8,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
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
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
    category_multiplier: number;
    chain_multiplier: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row; the page regenerates the farm plan from these fields, and the watchlist flag drives the watchlist-only filter. */
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
  growth_multiplier: number;
  maturity_multiplier: number;
  category_multiplier: number;
  chain_multiplier: number;
  watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** The category multiples the snapshot's live-token protocols imply: the overall median
 * market-cap-to-TVL and, for every category with enough live protocols, its own factor. */
export interface CategoryTable {
  overall_median: number;
  factors: Record<string, number>;
}

/** Everything the dashboard renders, from the snapshot. */
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
  category_table: CategoryTable;
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

/** Round to four decimals, for the multipliers the board reports. */
const roundTo4dp = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function asFinite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a list of numbers, or null when it holds none. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The category multiples the snapshot's live-token protocols imply.
 *
 * For every live-token protocol (a market cap and a TVL on record) the ratio is its market cap
 * over its TVL: what the market pays for a dollar of value secured. The overall median is the
 * market's own anchor, and each category's median, over that anchor, is how much more or less
 * the market pays for that kind of protocol. A category counts only when at least
 * `model.category_min_live` live protocols carry it, so a single outlier can never set a
 * multiple; the rest fall back to the anchor, a factor of 1.0.
 */
export function categoryMultiples(
  protocols: SnapshotProtocol[],
  model: ModelConstants = MODEL,
): CategoryTable {
  const all: number[] = [];
  const byCategory = new Map<string, number[]>();
  for (const p of protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    if (p.category !== null) {
      const list = byCategory.get(p.category) ?? [];
      list.push(ratio);
      byCategory.set(p.category, list);
    }
  }
  const overall = median(all) ?? model.base_multiple;
  const factors: Record<string, number> = {};
  for (const [category, ratios] of byCategory) {
    if (ratios.length < model.category_min_live) continue;
    const cat = median(ratios);
    if (cat === null) continue;
    // Rounded to four decimals here, so the board's implied value is a function of the
    // factors the dashboard carries: the drawer's recompute then agrees exactly.
    factors[category] = roundTo4dp(Math.min(model.category_factor_cap, Math.max(model.category_factor_floor, cat / overall)));
  }
  return { overall_median: roundTo4dp(overall), factors };
}

/** One protocol's category factor: its category's multiple, or 1.0 with no live comparable. */
export function categoryFactor(category: string | null, table: CategoryTable): number {
  if (category === null) return 1;
  return table.factors[category] ?? 1;
}

/** One protocol's chain factor: 2% per extra chain, capped, so reach counts but never dominates. */
export function chainMultiplier(chains: string[], model: ModelConstants = MODEL): number {
  const extra = Math.min(Math.max(chains.length - 1, 0), model.chain_cap_extra);
  // Rounded to four decimals, like the category factor, so the dashboard's recompute agrees.
  return roundTo4dp(1 + extra * model.chain_per_extra);
}

/**
 * The multipliers and the implied value one protocol gets under `model`.
 *
 * The growth term is the 7-day TVL change, clamped to the model's floor and cap so one hot week
 * can never dominate the ranking; the maturity term grows linearly with age up to four years and
 * then stays flat, so a three-year record scores about 1.8x a one-month record. The category
 * term is the market's own pricing for the protocol's kind, read from the snapshot's live-token
 * protocols; the chain term is the protocol's reach across chains. The base is the protocol's
 * TVL times the launch multiple: a new token is worth a fraction of the value its protocol
 * secures.
 */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  table: CategoryTable,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null; categoryMult: number; chainMult: number } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = asFinite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const clampedAge = Math.min(Math.max(ageForModel, 0), model.maturity_days);
  const maturityMult = model.maturity_floor + (clampedAge / model.maturity_days) * model.maturity_range;
  const categoryMult = categoryFactor(protocol.category, table);
  const chainMult = chainMultiplier(protocol.chains, model);
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * categoryMult * growthMult * maturityMult * chainMult));
  return { implied, growthPct, growthMult, maturityMult, age, categoryMult, chainMult };
}

/** A name ending in a release marker is a pool of another protocol, not a protocol of its own. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A name carrying a whole word wrapped, staked or staking is a product of a token that trades. */
const WRAPPED_OR_STAKED = /\b(wrapped|staked|staking)\b/i;

/** An exchange's name at the start of a protocol's name. */
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Categories whose products are a token that already trades, not a protocol awaiting one. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol's record carries no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank. This is the watchlist's own rule, applied to
 * every row and not only to the floor: a wrapped, staked or bridged product of a token that
 * already trades has no launch to rank (WBTC, Binance staked ETH and USDT0 are the rule's own
 * examples), and neither does an exchange, a versioned pool, or a bridge or liquid-staking
 * product. A protocol the rule leaves out for any other reason — below the floor, or simply not
 * named — is a fair subject.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_OR_STAKED.test(p.name)) return false;
  if (EXCHANGE_NAMES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** The snapshot's protocols indexed by slug, for the watchlist lookup. */
function indexBySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = indexBySlug(snapshot.protocols);
  const table = categoryMultiples(snapshot.protocols, model);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it, whether or not it is also early.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol in the snapshot, whatever its TVL.
  // The watchlist is a floor, never a ceiling, and a protocol the list leaves out is a fair
  // subject too.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const { implied, growthPct, growthMult, maturityMult, age, categoryMult, chainMult } = impliedValue(p, snapshot.as_of, model, table);
    return { p, implied, growthPct, growthMult, maturityMult, age, categoryMult, chainMult };
  });
  // Strongest first; a tie on implied value breaks by slug, so the order is deterministic.
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
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: roundTo4dp(s.growthMult),
      maturity_multiplier: roundTo4dp(s.maturityMult),
      age_days: s.age,
      category_multiplier: roundTo4dp(s.categoryMult),
      chain_multiplier: roundTo4dp(s.chainMult),
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** One step as a single string: its action, then its cost and time, within 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function firstChain(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function farmCapitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDays(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** What one transaction costs on a chain, in whole dollars: Ethereum is dear, Solana is near-free. */
function gasPriceFor(chain: string): string {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 'about $8';
  if (c === 'solana') return 'about $0.05';
  return 'about $0.50';
}

/** The category's main action, in words a farmer can follow. */
function primaryAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('liquid restak')) return `Restake $${capital} of the chain's staking asset through ${name} on ${chain} and hold the receipt token.`;
  if (c.includes('liquid stak')) return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and hold the liquid staking token.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('risk curator') || c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('yield')) return `Deposit $${capital} into ${name}'s main yield vault on ${chain} and let it compound.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second qualifying action: a different move on the same protocol. */
function followUpAction(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('liquid restak')) return `Use the restaking receipt in a lending market or a liquidity pool so the position works twice.`;
  if (c.includes('liquid stak')) return `Use the liquid staking token in a lending market or a liquidity pool instead of leaving it idle.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow a small amount against the supply, then repay it, so the position shows both sides of the market.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Swap $25 through the pool once, so the position shows a trade as well as liquidity.`;
  if (c.includes('bridge')) return `Bridge a second, smaller amount back the other way to show two-way use of the route.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close the hedge and open one more with a different size, keeping the margin in place.`;
  if (c.includes('prediction')) return `Place a second position on a different market to show repeat use.`;
  if (c.includes('risk curator') || c.includes('curator') || c.includes('allocator')) return `Read the vault's allocation report and top the position up once.`;
  if (c.includes('rwa')) return `Check the yield accrual on the asset and keep it held through one payout cycle.`;
  if (c.includes('stable')) return `Use the stable asset in one pool or payment so it circulates.`;
  if (c.includes('insurance')) return `Read the claims process and keep the policy through one renewal check.`;
  if (c.includes('yield')) return `Harvest or compound the vault's yield once, then leave the position running.`;
  return `Make a second, smaller deposit to the same position to show repeat use.`;
}

/** The chains that share one EVM wallet, lowercased: the rest either have their own wallet below or fall back to a plain one. */
const EVM_CHAINS = new Set([
  'ethereum', 'base', 'arbitrum', 'polygon', 'binance', 'avalanche', 'optimism', 'ink',
  'flare', 'monad', 'plasma', 'arc', 'mantle', 'zksync era', 'morph', 'stable', 'rsk',
  'mezo', 'manta', 'pharos', 'world chain', 'tempo', 'reya network', 'rise',
  'robinhood chain', 'hyperliquid l1', 'bsquared', 'xdai', 'cronos',
]);

/** The chain's wallet family: a few chains have their own wallet and fee token, most EVM chains share one, the rest fall back to a plain wallet. */
function chainKind(chain: string): string {
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

/** The wallet to open, from the chain's family: its own wallet and fee token where the chain has one, one EVM wallet otherwise. */
function setupStep(p: SnapshotProtocol, capital: number): string {
  const chain = firstChain(p);
  const kind = chainKind(chain);
  if (kind === 'solana') return `Set up a fresh Solana wallet with $${capital} of USDC and a little SOL for fees, and keep its seed phrase offline.`;
  if (kind === 'bitcoin') return `Set up a fresh Bitcoin wallet with $${capital} of USDC and a little BTC for fees, and keep its seed phrase offline.`;
  if (kind === 'stellar') return `Set up a fresh Stellar wallet with $${capital} of USDC and a little XLM for fees, and keep its seed phrase offline.`;
  if (kind === 'sui') return `Set up a fresh Sui wallet with $${capital} of USDC and a little SUI for fees, and keep its seed phrase offline.`;
  if (kind === 'aptos') return `Set up a fresh Aptos wallet with $${capital} of USDC and a little APT for fees, and keep its seed phrase offline.`;
  if (kind === 'tron') return `Set up a fresh Tron wallet with $${capital} of USDC and a little TRX for fees, and keep its seed phrase offline.`;
  if (kind === 'ripple') return `Set up a fresh XRP Ledger wallet with $${capital} of USDC and a little XRP for fees, and keep its seed phrase offline.`;
  if (kind === 'algorand') return `Set up a fresh Algorand wallet with $${capital} of USDC and a little ALGO for fees, and keep its seed phrase offline.`;
  if (kind === 'near') return `Set up a fresh NEAR wallet with $${capital} of USDC and a little NEAR for fees, and keep its seed phrase offline.`;
  if (kind === 'ton') return `Set up a fresh TON wallet with $${capital} of USDC and a little TON for fees, and keep its seed phrase offline.`;
  if (kind === 'bittensor') return `Set up a fresh Bittensor wallet with $${capital} of USDC and a little TAO for fees, and keep its seed phrase offline.`;
  if (kind === 'evm') return `Set up a fresh EVM wallet on ${chain} with $${capital} of USDC and a little native gas, and keep its seed phrase offline.`;
  return `Set up a fresh wallet on ${chain} with $${capital} of USDC and a little native gas, and keep its seed phrase offline.`;
}

/** The weekly top-up, from the position's size: a bigger farm tops up more. */
function weeklyTopUp(capital: number): number {
  if (capital >= 150) return 50;
  if (capital >= 100) return 25;
  return 10;
}

/** The week's recurring action, by category: what to check, and whether it moves money. */
function weeklyAction(p: SnapshotProtocol, top: number): { text: string; topUp: boolean } {
  const c = (p.category ?? '').toLowerCase();
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

/** Where to claim, by category: the protocol's own page for what it pays out. */
function claimStep(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
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

/** The farm log: the protocol, its chain and the hold, so the record reads for this farm alone. */
function logStep(p: SnapshotProtocol, chain: string, hold: number): string {
  return `After ${hold} days, write ${p.name} on ${chain}, the wallet, the dates and every transaction in a farm log, and plan the unwind before you need it.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is
 * derived from the protocol's own record (category, chains, TVL, age), never from a hand-written
 * list of names, and it never promises a token: it says what to do to farm the protocol, and
 * what each step costs in gas and capital and how long it takes.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = firstChain(p);
  const capital = farmCapitalFor(p);
  const hold = holdDays(age);
  const gas = gasPriceFor(chain);
  const top = weeklyTopUp(capital);
  const week = weeklyAction(p, top);
  return [
    {
      text: setupStep(p, capital),
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: primaryAction(p, capital, chain),
      cost: `$${capital} of capital and ${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: followUpAction(p, chain),
      cost: `${gas} of gas`,
      time: '10 minutes',
    },
    {
      text: week.text,
      cost: week.topUp ? `about $${top} to top up and $2 of gas a week` : 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: claimStep(p),
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: logStep(p, chain, hold),
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
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
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
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    category_multiplier: row.model.category_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    watchlist: watchlist.has(row.slug),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const watchlistSet = new Set(snapshot.watchlist);
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
    category_table: categoryMultiples(snapshot.protocols, model),
    rows: board.map((r) => radarRow(r, watchlistSet)),
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

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
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
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
