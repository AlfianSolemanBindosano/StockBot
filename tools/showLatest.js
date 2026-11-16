'use strict';

/**
 * tools/showLatest.js
 * Utility: pretty-print the latest recommendation results from output/latest.json
 * Usage: node tools/showLatest.js [--json] [--top N]
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');

const OUTPUT_DIR = process.env.OUTPUT_DIR || './output';
const latestPath = path.join(OUTPUT_DIR, 'latest.json');

const args    = process.argv.slice(2);
const asJson  = args.includes('--json');
const topIdx  = args.indexOf('--top');
const topN    = topIdx !== -1 ? parseInt(args[topIdx + 1], 10) : null;

if (!fs.existsSync(latestPath)) {
  console.error('❌  No latest.json found. Run the bot first.');
  process.exit(1);
}

let recommendations = JSON.parse(fs.readFileSync(latestPath, 'utf8'));

if (topN) recommendations = recommendations.slice(0, topN);

if (asJson) {
  console.log(JSON.stringify(recommendations, null, 2));
} else {
  console.log(`\n📊  Latest Stock Recommendations\n`);
  const header = ['SYMBOL','PRICE','REC','SCORE','RSI','SMA20/50'].map(h => h.padEnd(14)).join('');
  console.log(header);
  console.log('─'.repeat(header.length));
  for (const r of recommendations) {
    if (r.error) {
      console.log(`${r.symbol.padEnd(14)} Error: ${r.error}`);
      continue;
    }
    const row = [
      r.symbol.padEnd(14),
      String(r.price).padEnd(14),
      r.recommendation.padEnd(14),
      String(r.score).padEnd(14),
      (r.indicators?.rsi || 'N/A').padEnd(14),
      `${r.indicators?.sma20 || 'N/A'}/${r.indicators?.sma50 || 'N/A'}`.padEnd(14),
    ].join('');
    console.log(row);
  }
  console.log('');
}
