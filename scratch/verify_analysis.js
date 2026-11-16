'use strict';

require('dotenv').config();
const { getRecommendation } = require('../src/recommender/recommender');

async function test() {
  const symbols = ['BBCA.JK', 'ASII.JK', 'TLKM.JK'];
  console.log('--- STARTING ANALYSIS TEST ---');
  
  for (const symbol of symbols) {
    console.log(`Analyzing ${symbol}...`);
    const result = await getRecommendation(symbol);
    if (result.skipped) {
      console.log(`Skipped ${symbol}: ${result.reason}`);
    } else if (result.error) {
      console.log(`Error ${symbol}: ${result.error}`);
    } else {
      console.log(`Result for ${symbol}:`);
      console.log(`  Recommendation: ${result.recommendation}`);
      console.log(`  Confidence: ${result.confidence}%`);
      console.log(`  Score: ${result.score}`);
      console.log(`  WeightedScore: ${result.weightedScore}`);
      console.log(`  Flags: ${result.flags.join(', ')}`);
      console.log(`  RiskMgmt: Entry: ${result.riskMgmt.entry}, SL: ${result.riskMgmt.sl}, TP1: ${result.riskMgmt.tp1}, RR: ${result.riskMgmt.rr}`);
    }
    console.log('----------------------------');
  }
}

test();
