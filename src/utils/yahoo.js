'use strict';

const YahooFinance = require('yahoo-finance2').default;
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const yf = new YahooFinance({ suppressNotices: ['ripHistorical', 'yahooSurvey'] });

const CACHE_DIR = process.env.CACHE_DIR || path.join(process.env.OUTPUT_DIR || './output', 'cache');
const DEFAULT_TTL_MS = parseInt(process.env.CACHE_TTL_HOURS || '6', 10) * 3600000;
const DAY_MS = 86400000;

function cacheFile(symbol, interval, days) {
  const key = `${symbol}_${interval}_${days}`.replace(/[^\w.-]/g, '_');
  return path.join(CACHE_DIR, `${key}.json`);
}

/**
 * Daily (or weekly) OHLCV bars from Yahoo, cached on disk.
 * Replaces the deprecated historical() call which Yahoo rewrote to chart() anyway.
 * Returns rows shaped { date, open, high, low, close, volume }.
 */
async function fetchHistory(symbol, days, interval = '1d', ttlMs = DEFAULT_TTL_MS) {
  const file = cacheFile(symbol, interval, days);

  if (ttlMs > 0) {
    try {
      if (Date.now() - fs.statSync(file).mtimeMs < ttlMs) {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      }
    } catch { /* cache miss */ }
  }

  const res = await yf.chart(symbol, {
    period1: new Date(Date.now() - days * DAY_MS),
    period2: new Date(),
    interval
  });

  const rows = (res.quotes || [])
    .filter(q => q && q.close != null && q.high != null && q.low != null)
    .map(q => ({
      date: q.date instanceof Date ? q.date.toISOString() : String(q.date),
      open: q.open,
      high: q.high,
      low: q.low,
      close: q.close,
      volume: q.volume == null ? 0 : q.volume
    }));

  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(rows));
  } catch (e) {
    logger.warn(`[Yahoo] Cache write failed for ${symbol}: ${e.message}`);
  }

  return rows;
}

module.exports = { yf, fetchHistory, CACHE_DIR };
