'use strict';

/**
 * Logistic-regression calibration on backtest rows.
 *
 * Target: forward return over HORIZON > 0 (binary).
 * Split: time-based (oldest 70% of dates for train, newest 30% for test).
 * Model is only written if it beats the baseline on the test split.
 *
 * Usage: node src/eval/train.js [--in output/backtest.jsonl] [--horizon 20] [--epochs 4000]
 * Output: src/recommender/model.json
 */

const fs = require('fs');
const path = require('path');

const FEATURES = [
  { name: 'rsi', get: r => r.rsi },
  { name: 'atrPct', get: r => r.atrPct },
  { name: 'smaSpread', get: r => r.smaSpread },
  { name: 'volRatio', get: r => Math.min(r.volRatio, 5) },
  { name: 'distHigh20', get: r => r.distHigh20 },
  { name: 'macdHist', get: r => r.macdHist },
  { name: 'marketBullish', get: r => (r.marketBullish ? 1 : 0) },
  { name: 'weeklyConfirmed', get: r => (r.weeklyConfirmed ? 1 : 0) },
  { name: 'confidence', get: r => r.confidence }
];

function parseArgs(argv) {
  const args = { in: path.join(process.env.OUTPUT_DIR || './output', 'backtest.jsonl'), horizon: 20, epochs: 4000, lr: 0.15, l2: 0.001, target: 'xs' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in' && argv[i + 1]) args.in = argv[++i];
    else if (a === '--horizon' && argv[i + 1]) args.horizon = parseInt(argv[++i], 10);
    else if (a === '--epochs' && argv[i + 1]) args.epochs = parseInt(argv[++i], 10);
    else if (a === '--target' && argv[i + 1]) args.target = argv[++i];
  }
  return args;
}

function loadRows(file) {
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

function buildMatrix(rows, key, mode) {
  // 'abs' = did the stock go up? (picks market regime, not stocks)
  // 'xs'  = did the stock beat its peers that day? (what ranking actually needs)
  let labels = null;
  if (mode === 'xs') {
    labels = new Map();
    const byDate = new Map();
    for (const r of rows) {
      if (r[key] == null) continue;
      if (!byDate.has(r.date)) byDate.set(r.date, []);
      byDate.get(r.date).push(r);
    }
    for (const [, day] of byDate) {
      if (day.length < 5) continue;
      const mu = day.reduce((a, r) => a + r[key], 0) / day.length;
      for (const r of day) labels.set(r, r[key] - mu > 0 ? 1 : 0);
    }
  }

  const X = [];
  const y = [];
  const conf = [];
  for (const r of rows) {
    if (r[key] == null) continue;
    const label = labels ? labels.get(r) : (r[key] > 0 ? 1 : 0);
    if (label == null) continue;
    const vals = FEATURES.map(f => f.get(r));
    if (vals.some(v => v == null || Number.isNaN(v))) continue;
    X.push(vals);
    y.push(label);
    conf.push(r.confidence / 100);
  }
  return { X, y, conf };
}

function standardize(X) {
  const n = X.length;
  const m = X[0].length;
  const mu = new Array(m).fill(0);
  const sd = new Array(m).fill(0);

  for (const row of X) for (let j = 0; j < m; j++) mu[j] += row[j];
  for (let j = 0; j < m; j++) mu[j] /= n;

  for (const row of X) for (let j = 0; j < m; j++) sd[j] += (row[j] - mu[j]) ** 2;
  for (let j = 0; j < m; j++) sd[j] = Math.sqrt(sd[j] / n) || 1;

  return {
    mu,
    sd,
    apply: (X) => X.map(row => row.map((v, j) => (v - mu[j]) / sd[j]))
  };
}

function trainLogistic(X, y, epochs, lr, l2) {
  const n = X.length;
  const m = X[0].length;
  const w = new Array(m).fill(0);
  let b = 0;

  for (let e = 0; e < epochs; e++) {
    const gw = new Array(m).fill(0);
    let gb = 0;

    for (let i = 0; i < n; i++) {
      let z = b;
      for (let j = 0; j < m; j++) z += w[j] * X[i][j];
      const err = sigmoid(z) - y[i];
      for (let j = 0; j < m; j++) gw[j] += err * X[i][j];
      gb += err;
    }

    for (let j = 0; j < m; j++) w[j] -= lr * (gw[j] / n + l2 * w[j]);
    b -= lr * (gb / n);
  }

  return { w, b };
}

function predict(model, row) {
  let z = model.b;
  for (let j = 0; j < FEATURES.length; j++) z += model.w[j] * row[j];
  return sigmoid(z);
}

/** Area under ROC curve via rank statistics. */
function auc(scores, labels) {
  const pairs = scores.map((s, i) => [s, labels[i]]).sort((a, b) => a[0] - b[0]);
  let rank = 1;
  let rankSumPos = 0;
  let nPos = 0;
  let nNeg = 0;

  for (let i = 0; i < pairs.length; i++) {
    // handle ties by averaging ranks
    let j = i;
    while (j + 1 < pairs.length && pairs[j + 1][0] === pairs[i][0]) j++;
    const avgRank = (rank + (rank + (j - i))) / 2;
    for (let k = i; k <= j; k++) {
      if (pairs[k][1] === 1) { rankSumPos += avgRank; nPos++; }
      else nNeg++;
    }
    rank += (j - i + 1);
    i = j;
  }

  if (!nPos || !nNeg) return null;
  return (rankSumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const key = `fwd${args.horizon}`;
  const rows = loadRows(args.in);

  const dates = [...new Set(rows.map(r => r.date))].sort();
  const cut = dates[Math.floor(dates.length * 0.7)];

  const trainRows = rows.filter(r => r.date < cut);
  const testRows = rows.filter(r => r.date >= cut);

  const train = buildMatrix(trainRows, key, args.target);
  const test = buildMatrix(testRows, key, args.target);
  console.log(`Target: ${args.target === 'xs' ? 'beat peers that day (cross-sectional)' : 'absolute up/down'}`);

  console.log(`Train: ${train.X.length} rows (< ${cut})   pos rate ${(train.y.reduce((a, b) => a + b, 0) / train.y.length * 100).toFixed(1)}%`);
  console.log(`Test : ${test.X.length} rows (>= ${cut})  pos rate ${(test.y.reduce((a, b) => a + b, 0) / test.y.length * 100).toFixed(1)}%`);

  const scaler = standardize(train.X);
  const Xtr = scaler.apply(train.X);
  const Xte = scaler.apply(test.X);

  const { w, b } = trainLogistic(Xtr, train.y, args.epochs, args.lr, args.l2);
  const model = { w, b, mu: scaler.mu, sd: scaler.sd };

  const trainPred = Xtr.map(r => predict(model, r));
  const testPred = Xte.map(r => predict(model, r));

  const testAuc = auc(testPred, test.y);

  // baseline = confidence, standardised into the same pipeline for AUC comparison
  const baseAuc = auc(test.conf, test.y);

  console.log(`\nLogistic AUC (train): ${auc(trainPred, train.y)?.toFixed(4)}`);
  console.log(`Logistic AUC (test) : ${testAuc == null ? 'n/a' : testAuc.toFixed(4)}`);
  console.log(`Baseline AUC (test) : ${baseAuc == null ? 'n/a' : baseAuc.toFixed(4)}`);

  // top-decile lift on test split
  const order = testPred.map((p, i) => [p, test.y[i]]).sort((a, b) => b[0] - a[0]);
  const dec = Math.floor(order.length / 10);
  const topHit = order.slice(0, dec).filter(x => x[1] === 1).length / dec;
  const allHit = test.y.reduce((a, b) => a + b, 0) / test.y.length;
  console.log(`Top-decile hit: ${(topHit * 100).toFixed(1)}%  vs base ${(allHit * 100).toFixed(1)}%  lift ${((topHit - allHit) * 100).toFixed(1)}pp`);

  console.log('\nFeature weights (standardised):');
  FEATURES.forEach((f, i) => console.log(`  ${f.name.padEnd(16)} ${w[i].toFixed(4)}`));

  const better = testAuc != null && baseAuc != null && testAuc > baseAuc + 0.01;
  if (!better) {
    console.log('\nModel does NOT beat baseline AUC. Not writing model.json.');
    return;
  }

  const outPath = path.join(__dirname, '..', 'recommender', 'model.json');
  fs.writeFileSync(outPath, JSON.stringify({
    trainedAt: new Date().toISOString(),
    horizon: args.horizon,
    target: args.target,
    features: FEATURES.map(f => f.name),
    weights: w,
    bias: b,
    mu: scaler.mu,
    sd: scaler.sd,
    metrics: { testAuc, baseAuc, topDecileHit: topHit, baseHit: allHit }
  }, null, 2));

  console.log(`\nWrote ${outPath}`);
}

if (require.main === module) main();

module.exports = { FEATURES, auc, sigmoid };
