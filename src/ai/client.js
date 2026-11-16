'use strict';

const logger = require('../utils/logger');

const BASE = (process.env.AI_BASE_URL || 'https://9router.tefambo.site/v1').replace(/\/+$/, '');
const MODEL = process.env.AI_MODEL || 'Hermes-Combo';
const TIMEOUT_MS = parseInt(process.env.AI_TIMEOUT_MS || '25000', 10);

function isEnabled() {
  return Boolean(process.env.AI_API_KEY) && process.env.AI_ENABLED !== 'false';
}

/**
 * One OpenAI-compatible chat call. Returns assistant text, or null on any
 * failure. Never throws: the bot must behave exactly as before when the
 * provider is down, slow, or unconfigured.
 */
async function chat(messages, { maxTokens = 900, temperature = 0.2, timeoutMs = TIMEOUT_MS } = {}) {
  if (!isEnabled()) return null;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      signal: ac.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.AI_API_KEY}`
      },
      body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens, temperature, stream: false })
    });

    if (!res.ok) {
      logger.warn(`[AI] HTTP ${res.status} from provider`);
      return null;
    }

    const json = await res.json();
    const text = json.choices?.[0]?.message?.content;
    return typeof text === 'string' && text.trim() ? text.trim() : null;
  } catch (err) {
    logger.warn(`[AI] call failed: ${err.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Same as chat() but parses the reply as JSON. Models like to wrap arrays in
 * prose or fences, so slice from the first bracket to the last one.
 */
async function chatJSON(messages, opts) {
  const text = await chat(messages, opts);
  if (!text) return null;

  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));
  if (start < 0 || end <= start) return null;

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    logger.warn('[AI] reply was not valid JSON');
    return null;
  }
}

module.exports = { isEnabled, chat, chatJSON, MODEL };
