'use strict';

/**
 * Baseline metrics for the rule-based analyzer.
 * Reads output/backtest.jsonl produced by src/eval/backtest.js
 *
 * Reports:
 *  - hit rate + mean/median forward return per recommendation bucket
 *  - confidence decile monotonicity
 *  - Spearman rank correlation between confidence and forward return
 *  - equal-weight top-20-per-day portfolio vs universe average
 *
 * Usage: node src/eval/report.js [--in output/backtest.jsonl] [--horizon 20]
 */

const fs = require('fs');
const path = require('path');

const HORIZONS = [5, 10, 20];

function parseArgs(argv) {
  const args = { in: path.join(process.env.OUTPUT_DIR || './output', 'backtest.jsonl'), horizon: 20, top: 20, from: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in' && argv[i + 1]) args.in = argv[++i];
    else if (a === '--horizon' && argv[i + 1]) args.horizon = parseInt(argv[++i], 10);
    else if (a === '--top' && argv[i + 1]) args.top = parseInt(argv[++i], 10);
    else if (a === '--from' && argv[i + 1]) args.from = argv[++i];
  }
  return args;
}

function loadRows(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  return lines.map(l => JSON.parse(l));
}

function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function stdev(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

function ranks(xs) {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let i = 0; i < idx.length; i++) r[idx[i][1]] = i + 1;
  return r;
}

/** Spearman rank correlation. */
function spearman(a, b) {
  if (a.length < 3) return null;
  const ra = ranks(a);
  const rb = ranks(b);
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  if (da === 0 || db === 0) return null;
  return num / Math.sqrt(da * db);
}

function fmt(v, digits = 2) {
  return v == null ? '   n/a' : v.toFixed(digits).padStart(7);
}

function pct(v) {
  return v == null ? '  n/a' : `${(v * 100).toFixed(1)}%`.padStart(6);
}

/** Attach mlProb to rows using the trained model, if present and complete. */
function applyModel(rows) {
  let m;
  try {
    m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'recommender', 'model.json'), 'utf8'));
  } catch (e) {
    return null;
  }
  for (const r of rows) {
    let z = m.bias;
    let ok = true;
    for (let i = 0; i < m.features.length; i++) {
      const v = r[m.features[i]];
      if (v == null || Number.isNaN(v)) { ok = false; break; }
      z += m.weights[i] * ((v - m.mu[i]) / m.sd[i]);
    }
    r.mlProb = ok ? 1 / (1 + Math.exp(-z)) : null;
  }
  return m;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = loadRows(args.in);
  const key = `fwd${args.horizon}`;

  if (!rows.length) {
    console.log('No rows found. Run src/eval/backtest.js first.');
    return;
  }

  const model = applyModel(rows);
  if (args.from) {
    const kept = rows.filter(r => r.date >= args.from);
    console.log(`\n[filter] --from ${args.from}: ${kept.length}/${rows.length} rows`);
    rows.length = 0;
    rows.push(...kept);
    if (!rows.length) { console.log('No rows after filter.'); return; }
  }

  const dates = [...new Set(rows.map(r => r.date))].sort();
  console.log(`\n=== BASELINE REPORT ===`);
  console.log(`Rows: ${rows.length}  Symbols: ${new Set(rows.map(r => r.symbol)).size}  Dates: ${dates.length}`);
  console.log(`Period: ${dates[0]} .. ${dates[dates.length - 1]}`);
  console.log(`Primary horizon: ${args.horizon} trading days\n`);
  if (model) {
    console.log(`ML overlay: model.json horizon=${model.horizon}d testAUC=${model.metrics?.testAuc}\n`);
  } else {
    console.log('ML overlay: model.json missing — mlProb column omitted\n');
  }

  // --- per recommendation bucket
  const buckets = ['STRONG BUY', 'BUY', 'HOLD', 'SELL', 'STRONG SELL'];
  console.log('Recommendation   n     hit     mean%    med%    sd%');
  console.log('─'.repeat(58));
  for (const b of buckets) {
    const sub = rows.filter(r => r.recommendation === b && r[key] != null);
    if (!sub.length) { console.log(`${b.padEnd(15)} 0`); continue; }
    const fr = sub.map(r => r[key]);
    const hit = fr.filter(v => v > 0).length / fr.length;
    console.log(`${b.padEnd(15)} ${String(sub.length).padStart(4)}  ${pct(hit)}  ${fmt(mean(fr))} ${fmt(median(fr))} ${fmt(stdev(fr))}`);
  }

  // --- forward returns by horizon for BUY-ish
  console.log('\nForward returns by horizon');
  console.log('Horizon  all-mean%  BUY+-mean%  BUY+-hit');
  console.log('─'.repeat(44));
  for (const h of HORIZONS) {
    const k = `fwd${h}`;
    const all = rows.filter(r => r[k] != null);
    const buys = all.filter(r => r.recommendation === 'BUY' || r.recommendation === 'STRONG BUY');
    const buysHit = buys.length ? buys.filter(r => r[k] > 0).length / buys.length : null;
    console.log(`${String(h).padStart(5)}d ${fmt(mean(all.map(r => r[k])))}    ${fmt(mean(buys.map(r => r[k])))}   ${pct(buysHit)}`);
  }

  // --- confidence deciles
  const withFwd = rows.filter(r => r[key] != null && r.confidence != null);
  const sorted = [...withFwd].sort((a, b) => a.confidence - b.confidence);
  const decileSize = Math.ceil(sorted.length / 10);
  console.log('\nConfidence decile -> mean forward return (monotonic = good)');
  console.log('Decile  conf-range     n    mean%    hit');
  console.log('─'.repeat(48));
  for (let d = 0; d < 10; d++) {
    const sub = sorted.slice(d * decileSize, (d + 1) * decileSize);
    if (!sub.length) continue;
    const fr = sub.map(r => r[key]);
    console.log(
      `   ${String(d + 1).padStart(2)}   ${String(sub[0].confidence).padStart(3)}-${String(sub[sub.length - 1].confidence).padEnd(3)}  ${String(sub.length).padStart(5)}  ${fmt(mean(fr))}  ${pct(fr.filter(v => v > 0).length / fr.length)}`
    );
  }

  // --- rank correlations
  console.log('\nRank correlation (Spearman) vs forward return');
  for (const field of ['confidence', 'score', 'weightedScore', 'mlProb']) {
    const sub = withFwd.filter(r => r[field] != null);
    if (!sub.length) continue;
    const rho = spearman(sub.map(r => r[field]), sub.map(r => r[key]));
    console.log(`  ${field.padEnd(14)} ${rho == null ? 'n/a' : rho.toFixed(4)}`);
  }

  // --- daily top-N portfolio vs universe average, per ranker
  const rankers = ['confidence', 'mlProb'].filter(f => withFwd.some(r => r[f] != null));
  for (const ranker of rankers) {
    const usable = withFwd.filter(r => r[ranker] != null);
    const byDate = new Map();
    for (const r of usable) {
      if (!byDate.has(r.date)) byDate.set(r.date, []);
      byDate.get(r.date).push(r);
    }
    const portReturns = [];
    const uniReturns = [];
    for (const [, dayRows] of byDate) {
      if (dayRows.length < args.top) continue;
      const top = [...dayRows].sort((a, b) => b[ranker] - a[ranker]).slice(0, args.top);
      portReturns.push(mean(top.map(r => r[key])));
      uniReturns.push(mean(dayRows.map(r => r[key])));
    }
    const pm = mean(portReturns);
    const um = mean(uniReturns);
    const pw = portReturns.filter(v => v > 0).length / portReturns.length;
    console.log(`\nTop-${args.top} per day by ${ranker} vs universe average (${args.horizon}d, equal weight)`);
    console.log(`  days: ${portReturns.length}`);
    console.log(`  portfolio mean: ${fmt(pm)}%   hit: ${pct(pw)}`);
    console.log(`  universe  mean: ${fmt(um)}%`);
    console.log(`  edge:           ${fmt(pm != null && um != null ? pm - um : null)}%`);
  }
  console.log('');
}

if (require.main === module) main();

module.exports = { spearman, median, mean };
