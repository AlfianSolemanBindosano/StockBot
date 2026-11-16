'use strict';

const { isEnabled, chat, chatJSON } = require('./client');
const news = require('./news');
const logger = require('../utils/logger');

const LABELS = ['positif', 'netral', 'negatif'];

function scoreLabel(s) {
  if (s == null) return null;
  if (s >= 0.25) return 'positif';
  if (s <= -0.25) return 'negatif';
  return 'netral';
}

/**
 * Sentiment pass: headlines -> {symbol: {score, reason}}.
 * Symbol list comes from the results already ranked by the rule engine.
 */
async function sentimentPass(headlinesBySymbol) {
  const withNews = Object.entries(headlinesBySymbol).filter(([, h]) => h && h.length);
  if (!withNews.length) return {};

  const lines = withNews.map(([sym, hs]) =>
    `${sym.replace(/\.JK$/i, '')}:\n` + hs.map(h => `  - ${h.title} (${h.source}, ${h.date})`).join('\n')
  ).join('\n\n');

  const parsed = await chatJSON([
    {
      role: 'system',
      content:
        'You are an Indonesian equity news classifier. You score only what the headlines explicitly state. ' +
        'Never infer price direction from a company name. Reply with JSON only.'
    },
    {
      role: 'user',
      content:
        `Berita saham IDX (10 hari terakhir):\n\n${lines}\n\n` +
        'Untuk setiap emiten, beri skor sentimen -1..+1 berdasarkan nada berita terhadap harga saham ' +
        '(aksi korporasi, laba, regulasi, aliran dana asing, berita negatif). ' +
        'Balas JSON array: [{"symbol":"BBCA","score":0.3,"reason":"<= 15 kata, bahasa Indonesia"}]. ' +
        'Jika berita tidak relevan dengan emiten tersebut, pakai score 0 dan reason "tidak ada berita relevan".'
    }
  ], { maxTokens: 800, temperature: 0 });

  if (!Array.isArray(parsed)) return {};

  const out = {};
  for (const row of parsed) {
    if (!row || typeof row.symbol !== 'string') continue;
    const score = Number(row.score);
    if (!Number.isFinite(score)) continue;
    out[row.symbol.toUpperCase().replace(/\.JK$/, '')] = {
      score: Math.max(-1, Math.min(1, score)),
      label: scoreLabel(Math.max(-1, Math.min(1, score))),
      reason: String(row.reason || '').slice(0, 160)
    };
  }
  return out;
}

/**
 * Narration pass: one short Indonesian paragraph per surfaced stock.
 * Descriptive only — it explains numbers the rule engine and model already
 * produced. It never invents a recommendation and never changes one.
 */
async function narrationPass(rows) {
  if (!rows.length) return {};

  const brief = rows.map(r => ({
    symbol: r.symbol.replace(/\.JK$/i, ''),
    harga: r.price,
    sinyal: r.recommendation,
    skor_aturan: r.score,
    keyakinan: r.confidence,
    rs: r.rsScore,
    sektor: r.sector,
    prob_naik_20d: r.mlProb == null ? null : +(r.mlProb * 100).toFixed(1),
    sentimen: r.sentiment?.score ?? null,
    indikator: r.flags,
    entry: r.riskMgmt?.entry,
    sl: r.riskMgmt?.sl,
    tp1: r.riskMgmt?.tp1
  }));

  const parsed = await chatJSON([
    {
      role: 'system',
      content:
        'You are a terse Indonesian market commentator writing for a retail Telegram channel. ' +
        'You only restate and connect the numbers given to you. You never add facts, never predict prices, ' +
        'never mention targets other than the ones supplied, and never give new buy/sell calls.'
    },
    {
      role: 'user',
      content:
        `Data hasil analisis:\n${JSON.stringify(brief)}\n\n` +
        'Tulis SATU paragraf 2-3 kalimat (maks 320 karakter) per emiten dalam bahasa Indonesia yang menjelaskan ' +
        'kenapa setup ini muncul: hubungkan sinyal teknikal, RS, probabilitas model, dan sentimen berita bila ada. ' +
        'Jangan mengarang berita. Jangan menyarankan aksi di luar sinyal yang diberikan. ' +
        'Balas JSON array: [{"symbol":"BBCA","note":"..."}].'
    }
  ], { maxTokens: 1600, temperature: 0.3 });

  if (!Array.isArray(parsed)) return {};

  const out = {};
  for (const row of parsed) {
    if (!row || typeof row.symbol !== 'string' || typeof row.note !== 'string') continue;
    const note = row.note.trim().replace(/\s+/g, ' ');
    if (note) out[row.symbol.toUpperCase().replace(/\.JK$/, '')] = note.slice(0, 400);
  }
  return out;
}

/**
 * Attach `sentiment` and `aiNote` to the rows that will actually be sent.
 * Purely additive: ranking, score, and recommendation are untouched.
 * Returns false immediately when no key is configured, so callers can skip.
 */
async function enrich(results) {
  if (!isEnabled() || !results.length) return false;

  const t0 = Date.now();
  const symbols = results.map(r => r.symbol);

  let headlines = {};
  try {
    headlines = await news.fetchAll(symbols);
  } catch (e) {
    logger.warn(`[AI] news fetch failed: ${e.message}`);
  }

  const sentiment = await sentimentPass(headlines);

  for (const r of results) {
    const s = sentiment[r.symbol.replace(/\.JK$/i, '')];
    r.sentiment = s || null;
    r.headlineCount = (headlines[r.symbol] || []).length;
  }

  const notes = await narrationPass(results);
  for (const r of results) {
    const n = notes[r.symbol.replace(/\.JK$/i, '')];
    r.aiNote = n || null;
  }

  const filled = results.filter(r => r.aiNote).length;
  logger.info(`[AI] enriched ${filled}/${results.length} rows in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return filled > 0;
}

module.exports = { enrich, isEnabled, sentimentPass, narrationPass, LABELS };
