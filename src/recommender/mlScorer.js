'use strict';

/**
 * Optional ML overlay on top of the rule-based analyzer.
 *
 * Loads model.json (produced by src/eval/train.js). If the file is missing or
 * malformed the overlay is silently disabled and the bot behaves exactly as
 * before — no crash, no blocking, no API key.
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const MODEL_PATH = path.join(__dirname, 'model.json');

let model = null;

function load() {
  if (model !== null) return model;
  try {
    const raw = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8'));
    if (!Array.isArray(raw.weights) || raw.weights.length !== raw.features.length) throw new Error('shape mismatch');
    model = raw;
    logger.info(`[MLScorer] Model loaded (${raw.features.length} features, horizon ${raw.horizon}d, test AUC ${raw.metrics?.testAuc?.toFixed(3)})`);
  } catch (e) {
    model = false; // sentinel: disabled
    if (e.code !== 'ENOENT') logger.warn(`[MLScorer] Disabled: ${e.message}`);
  }
  return model;
}

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

/**
 * @param {Object} features - Flat feature bag keyed by the names in model.json.
 * @returns {{mlProb:number, mlScore:number}|null} null when disabled or incomplete.
 */
function score(features) {
  const m = load();
  if (!m) return null;

  let z = m.bias;
  for (let i = 0; i < m.features.length; i++) {
    const v = features[m.features[i]];
    if (v == null || Number.isNaN(v)) return null;
    z += m.weights[i] * ((v - m.mu[i]) / m.sd[i]);
  }

  const p = sigmoid(z);
  return {
    mlProb: parseFloat(p.toFixed(4)),
    mlScore: Math.round(p * 100)
  };
}

function isEnabled() {
  return !!load();
}

module.exports = { score, isEnabled };
