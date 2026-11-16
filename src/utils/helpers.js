'use strict';

/**
 * Random integer between min and max (inclusive)
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Async sleep with random delay range
 */
function sleep(minMs, maxMs) {
  const ms = maxMs ? randomInt(minMs, maxMs) : minMs;
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry wrapper with exponential backoff
 */
async function withRetry(fn, maxRetries = 3, label = 'operation') {
  const logger = require('./logger');
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      logger.warn(`[Retry ${attempt}/${maxRetries}] ${label} failed: ${err.message}`);
      if (attempt === maxRetries) throw err;
      const backoff = randomInt(2000, 5000) * attempt;
      logger.info(`Waiting ${backoff}ms before retry...`);
      await sleep(backoff);
    }
  }
}

/**
 * Safe JSON parse – returns null on failure
 */
function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * Deep-get a nested property with a fallback
 */
function deepGet(obj, path, fallback = 'DATA_NOT_FOUND') {
  const keys = Array.isArray(path) ? path : path.split('.');
  let cur = obj;
  for (const key of keys) {
    if (cur === null || cur === undefined) return fallback;
    cur = cur[key];
  }
  return cur === undefined || cur === null ? fallback : cur;
}

/**
 * Escape HTML special characters
 */
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = { randomInt, sleep, withRetry, safeJsonParse, deepGet, escapeHTML };
