'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const CACHE_DIR = path.join(process.env.OUTPUT_DIR || './output', 'news');
const TTL_MS = parseInt(process.env.NEWS_TTL_HOURS || '6', 10) * 3600000;
const MAX_AGE_DAYS = parseInt(process.env.NEWS_MAX_AGE_DAYS || '10', 10);

function decode(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .trim();
}

async function httpGet(url, timeoutMs = 8000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StockBot/2.6)' }
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Headlines for an IDX ticker via Google News RSS.
 * Yahoo carries essentially no Indonesian coverage, so Yahoo is not used.
 * Returns [] on any failure — sentiment is optional by design.
 */
async function fetchHeadlines(symbol) {
  const code = symbol.replace(/\.JK$/i, '');
  const file = path.join(CACHE_DIR, `${code}.json`);

  try {
    if (Date.now() - fs.statSync(file).mtimeMs < TTL_MS) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch { /* cache miss */ }

  const q = encodeURIComponent(`${code} saham`);
  const xml = await httpGet(`https://news.google.com/rss/search?q=${q}&hl=id&gl=ID&ceid=ID:id`);
  if (!xml) return [];

  const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map(m => m[1])
    .map(raw => {
      const title = decode((raw.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
      const date = (raw.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
      const source = decode((raw.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || '');
      return { title, source, ts: Date.parse(date) || 0 };
    })
    .filter(h => h.title && h.ts >= cutoff)
    .slice(0, 8)
    .map(h => ({ title: h.title.slice(0, 160), source: h.source, date: new Date(h.ts).toISOString().slice(0, 10) }));

  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(items));
  } catch (e) {
    logger.warn(`[News] cache write failed for ${code}: ${e.message}`);
  }

  return items;
}

/** Headlines for many symbols, bounded concurrency so Google does not rate-limit us. */
async function fetchAll(symbols, concurrency = 5) {
  const out = {};
  const queue = [...symbols];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const sym = queue.shift();
      out[sym] = await fetchHeadlines(sym);
    }
  });
  await Promise.all(workers);
  return out;
}

module.exports = { fetchHeadlines, fetchAll };
