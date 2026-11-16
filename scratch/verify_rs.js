'use strict';

const rsEngine = require('../src/recommender/rsEngine');
const logger = require('../src/utils/logger');

async function verify() {
  try {
    console.log('--- Verifying IHSG Performance ---');
    const ihsg = await rsEngine.getIHSGPerformance();
    console.log('IHSG Performance:', ihsg);

    console.log('\n--- Verifying Sector Performances ---');
    const sectors = await rsEngine.getSectorPerformances();
    Object.entries(sectors).forEach(([name, data]) => {
      console.log(`Sector: ${name}`);
      console.log(`  RS Score: ${data.rsScore.toFixed(2)}`);
      console.log(`  Rank: ${data.rank}`);
      console.log(`  Above SMA20: ${data.aboveSMA20}`);
      console.log(`  Above SMA50: ${data.aboveSMA50}`);
    });

  } catch (err) {
    console.error('Verification failed:', err);
  }
}

verify();
