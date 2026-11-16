'use strict';

/**
 * Walk-forward backtest for the rule-based analyzer.
 *
 * Replays analyzeStock() bar by bar with strict no-lookahead: at bar i only
 * history[0..i] is visible. Forward returns are recorded for later evaluation.
 *
 * Deliberate simplifications:
 *  - analystTrends are not point-in-time -> sentiment component omitted.
 *  - sectorRS is not point-in-time -> defaults to neutral ('Lainnya').
 *  - weeklyConfirmed derived by aggregating the same daily series into weeks.
 *
 * Usage: node src/eval/backtest.js [--symbols BBCA.JK,ASII.JK] [--days 900] [--out output/backtest.jsonl]
 */

const fs = require('fs');
const path = require('path');
const { fetchHistory } = require('../utils/yahoo');
const { calculateIndicators } = require('../recommender/indicators');
const { analyzeStock } = require('../recommender/analyzer');
const logger = require('../utils/logger');

const HORIZONS = [5, 10, 20];
const WARMUP = 60;

const DEFAULT_UNIVERSE = [
  'BBCA.JK', 'BBRI.JK', 'BMRI.JK', 'BBNI.JK', 'BRIS.JK', 'ARTO.JK',
  'ASII.JK', 'UNTR.JK', 'TLKM.JK', 'ISAT.JK', 'EXCL.JK', 'JSMR.JK',
  'ADRO.JK', 'ITMG.JK', 'PTBA.JK', 'MEDC.JK', 'HRUM.JK',
  'TPIA.JK', 'BRPT.JK', 'MDKA.JK', 'ANTM.JK', 'INCO.JK', 'SMGR.JK',
  'ICBP.JK', 'INDF.JK', 'UNVR.JK', 'AMRT.JK', 'CPIN.JK', 'KLBF.JK',
  'GOTO.JK', 'BUKA.JK', 'EMTK.JK', 'PGAS.JK', 'AKRA.JK', 'MAPI.JK',
  'ACES.JK', 'CTRA.JK', 'BSDE.JK', 'PWON.JK', 'SMRA.JK', 'SCMA.JK',
  'INKP.JK', 'TKIM.JK'
];

function parseArgs(argv) {
  const args = { symbols: DEFAULT_UNIVERSE, days: 900, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--symbols' && argv[i + 1]) args.symbols = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--days' && argv[i + 1]) args.days = parseInt(argv[++i], 10);
    else if (a === '--out' && argv[i + 1]) args.out = argv[++i];
  }
  if (!args.out) args.out = path.join(process.env.OUTPUT_DIR || './output', 'backtest.jsonl');
  return args;
}

function dayKey(dateish) {
  return String(dateish).slice(0, 10);
}

function smaAt(values, period, endIndex) {
  if (endIndex + 1 < period) return null;
  let sum = 0;
  for (let i = endIndex + 1 - period; i <= endIndex; i++) sum += values[i];
  return sum / period;
}

/**
 * date -> IHSG regime, using only IHSG bars up to and including that date.
 */
function buildRegimeLookup(ihsgHistory) {
  const closes = ihsgHistory.map(h => h.close);
  const map = new Map();
  for (let i = 0; i < ihsgHistory.length; i++) {
    const avg = smaAt(closes, 50, i);
    if (avg == null) continue;
    map.set(dayKey(ihsgHistory[i].date), { isBullish: closes[i] > avg, lastClose: closes[i], sma50: avg });
  }
  return map;
}

/** Aggregate daily bars into weekly bars, up to endIndex inclusive. */
function toWeekly(history, endIndex) {
  const out = [];
  let bucket = null;
  let bucketKey = null;
  for (let i = 0; i <= endIndex; i++) {
    const bar = history[i];
    const week = Math.floor(i / 5);
    if (week !== bucketKey) {
      if (bucket) out.push(bucket);
      bucketKey = week;
      bucket = { date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume || 0 };
    } else {
      bucket.high = Math.max(bucket.high, bar.high);
      bucket.low = Math.min(bucket.low, bar.low);
      bucket.close = bar.close;
      bucket.volume += bar.volume || 0;
    }
  }
  if (bucket) out.push(bucket);
  return out;
}

function runSymbol(symbol, daily, regimeLookup, out, stats) {
  const maxHorizon = HORIZONS[HORIZONS.length - 1];
  let emitted = 0;

  for (let i = WARMUP; i + maxHorizon < daily.length; i++) {
    const slice = daily.slice(0, i + 1);
    const indicators = calculateIndicators(slice);
    if (indicators.error) continue;

    const last20 = slice.slice(-20);
    const avgVolume20 = last20.reduce((a, b) => a + (b.volume || 0), 0) / last20.length;
    const highestHigh20 = Math.max(...last20.map(b => b.high));

    let weeklyConfirmed = false;
    const weekly = toWeekly(daily, i);
    if (weekly.length >= 20) {
      const wInd = calculateIndicators(weekly);
      if (!wInd.error) weeklyConfirmed = wInd.lastClose > wInd.sma20 || wInd.rsi > 50;
    }

    const regime = regimeLookup.get(dayKey(daily[i].date)) || { isBullish: true };

    const analysis = analyzeStock({
      symbol,
      history: slice,
      indicators,
      marketRegime: regime,
      analystTrends: null,
      avgVolume20,
      highestHigh20,
      weeklyConfirmed,
      sectorRS: { sector: 'Lainnya', rsScore: 0, rank: 99, isTopTier: false }
    });

    if (analysis.skipped) { stats.skipped++; continue; }

    const close = daily[i].close;
    const row = {
      symbol,
      date: dayKey(daily[i].date),
      price: parseFloat(close.toFixed(2)),
      recommendation: analysis.recommendation,
      confidence: analysis.confidence,
      score: parseFloat(analysis.score),
      weightedScore: parseFloat(analysis.weightedScore),
      rsi: indicators.rsi == null ? null : parseFloat(indicators.rsi.toFixed(2)),
      atrPct: parseFloat(((indicators.atr / close) * 100).toFixed(2)),
      smaSpread: parseFloat((((indicators.sma20 - indicators.sma50) / indicators.sma50) * 100).toFixed(2)),
      volRatio: parseFloat((slice[slice.length - 1].volume / (avgVolume20 || 1)).toFixed(2)),
      distHigh20: parseFloat((((close - highestHigh20) / highestHigh20) * 100).toFixed(2)),
      macdHist: indicators.macd ? parseFloat((indicators.macd.histogram || 0).toFixed(3)) : null,
      marketBullish: !!regime.isBullish,
      weeklyConfirmed,
      flags: analysis.flags
    };

    for (const h of HORIZONS) {
      row[`fwd${h}`] = parseFloat((((daily[i + h].close - close) / close) * 100).toFixed(3));
    }

    out.write(JSON.stringify(row) + '\n');
    emitted++;
    stats.rows++;
  }

  logger.info(`[Backtest] ${symbol}: ${emitted} samples`);
  return emitted;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  logger.info(`[Backtest] Universe ${args.symbols.length} symbols, ${args.days} days`);

  const ihsg = await fetchHistory('^JKSE', args.days);
  const regimeLookup = buildRegimeLookup(ihsg);
  logger.info(`[Backtest] IHSG regime lookup: ${regimeLookup.size} trading days`);

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  const out = fs.createWriteStream(args.out, { flags: 'w' });
  const stats = { rows: 0, skipped: 0, failed: [] };

  for (const symbol of args.symbols) {
    try {
      const daily = await fetchHistory(symbol, args.days);
      if (daily.length < WARMUP + HORIZONS[HORIZONS.length - 1] + 1) {
        logger.warn(`[Backtest] ${symbol}: only ${daily.length} bars, skipping`);
        continue;
      }
      runSymbol(symbol, daily, regimeLookup, out, stats);
    } catch (e) {
      logger.error(`[Backtest] ${symbol} failed: ${e.message}`);
      stats.failed.push(symbol);
    }
  }

  await new Promise(resolve => out.end(resolve));
  logger.info(`[Backtest] ${stats.rows} rows (${stats.skipped} filtered) -> ${args.out}`);
  if (stats.failed.length) logger.warn(`[Backtest] Failed: ${stats.failed.join(', ')}`);
}

if (require.main === module) {
  main().catch(e => {
    logger.error(`[Backtest] Fatal: ${e.stack || e.message}`);
    process.exit(1);
  });
}

module.exports = { runSymbol, buildRegimeLookup, toWeekly, DEFAULT_UNIVERSE, HORIZONS, WARMUP };
