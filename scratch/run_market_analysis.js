'use strict';

const marketEngine = require('../src/recommender/marketEngine');
const logger = require('../src/utils/logger');

async function run() {
  try {
    const analysis = await marketEngine.analyzeMarket();
    console.log(JSON.stringify(analysis, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }));
  }
}

run();
