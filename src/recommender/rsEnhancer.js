'use strict';

const rsEngine = require('./rsEngine');
const { getSectorForTicker } = require('../utils/sectorMapping');
const logger = require('../utils/logger');

/**
 * Enhances a stock analysis result with Relative Strength metrics.
 * This is an additive enhancement layer.
 */
async function enhanceWithRS(analysisResult, stockHistory) {
  try {
    const sector = getSectorForTicker(analysisResult.symbol);
    const rsData = await rsEngine.calculateStockRS(analysisResult.symbol, sector, stockHistory);
    
    // Add new fields to the result
    analysisResult.sector = sector;
    analysisResult.rsScore = parseFloat(rsData.rsScore.toFixed(2));
    analysisResult.rsBenchmark = rsData.benchmark;
    
    // Additional filters as requested:
    // SAHAM: bonus score if: breakout high, volume > average volume, di atas SMA20, di atas SMA50
    const lastClose = analysisResult.price || analysisResult.indicators?.lastClose;
    const indicators = analysisResult.indicators || {};
    
    // We can use flags to represent these bonuses
    if (lastClose > indicators.sma20) analysisResult.flags.push('Above SMA20');
    if (lastClose > indicators.sma50) analysisResult.flags.push('Above SMA50');
    
    // Sector RS Ranking bonus
    const sectorRankings = await rsEngine.getSectorPerformances();
    const sectorData = sectorRankings[sector];
    if (sectorData && sectorData.rank <= 3) {
      analysisResult.flags.push('Top Tier Sector');
    }

    if (analysisResult.rsScore > 5) {
      analysisResult.flags.push('High Relative Strength');
    }
    
    if (analysisResult.rsScore > 10) {
      analysisResult.flags.push('Sector Leader');
    }

    return analysisResult;
  } catch (err) {
    logger.error(`[RSEnhancer] Error enhancing ${analysisResult.symbol}: ${err.message}`);
    return analysisResult;
  }
}

/**
 * Gets sector rankings for the market summary.
 */
async function getSectorRankings() {
  const sectorPerfs = await rsEngine.getSectorPerformances();
  return Object.entries(sectorPerfs)
    .map(([name, data]) => ({
      name,
      rsScore: data.rsScore,
      rank: data.rank,
      aboveSMA20: data.aboveSMA20,
      aboveSMA50: data.aboveSMA50
    }))
    .sort((a, b) => a.rank - b.rank);
}

module.exports = {
  enhanceWithRS,
  getSectorRankings
};
