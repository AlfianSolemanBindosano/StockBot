'use strict';

const { yf, fetchHistory } = require('../utils/yahoo');
const { calculateIndicators } = require('./indicators');
const { analyzeStock } = require('./analyzer');
const { getSectorForTicker } = require('../utils/sectorMapping');
const rsEngine = require('./rsEngine');
const mlScorer = require('./mlScorer');
const logger = require('../utils/logger');

let cachedMarketRegime = null;
let lastMarketRegimeUpdate = 0;

/**
 * Analyze IHSG to determine market regime.
 */
async function getMarketRegime() {
  const now = Date.now();
  if (cachedMarketRegime && (now - lastMarketRegimeUpdate < 3600000)) { // Cache for 1 hour
    return cachedMarketRegime;
  }

  try {
    const history = await fetchHistory('^JKSE', 200);
    const indicators = calculateIndicators(history);
    const isBullish = indicators.lastClose > indicators.sma50;
    
    cachedMarketRegime = {
      isBullish,
      rsi: indicators.rsi,
      lastClose: indicators.lastClose,
      sma50: indicators.sma50
    };
    lastMarketRegimeUpdate = now;
    
    logger.info(`[MarketRegime] IHSG is ${isBullish ? 'BULLISH' : 'BEARISH'} (Close: ${indicators.lastClose.toFixed(0)}, SMA50: ${indicators.sma50.toFixed(0)})`);
    return cachedMarketRegime;
  } catch (error) {
    logger.error(`[MarketRegime] Error analyzing IHSG: ${error.message}`);
    return { isBullish: true }; // Default to bullish if check fails
  }
}

/**
 * Generate a recommendation for a given stock symbol.
 * @param {string} symbol - Stock symbol.
 * @param {number} maxPriceOverride - Optional max price override.
 * @returns {Promise<Object>} Recommendation details.
 */
async function getRecommendation(symbol, maxPriceOverride = null) {
  try {
    logger.info(`[Recommender] Fetching data for ${symbol}...`);

    // 1. Fetch Market Regime first
    const marketRegime = await getMarketRegime();

    // 2. Fetch Analyst Recommendations and Financials
    const summary = await yf.quoteSummary(symbol, {
      modules: ['recommendationTrend', 'financialData', 'price', 'summaryDetail']
    });

    const price = summary.price?.regularMarketPrice;
    const volume = summary.price?.regularMarketVolume || summary.summaryDetail?.volume;
    
    // Use override if provided, otherwise fallback to .env or default 500
    const maxPrice = maxPriceOverride || parseInt(process.env.MAX_STOCK_PRICE || '500', 10);

    if (!price || price === 0 || !volume || volume === 0) {
      return { symbol, skipped: true, reason: 'Inactive or suspended' };
    }

    if (price > maxPrice) {
      return { symbol, skipped: true, reason: `Price ${price} above limit (${maxPrice})` };
    }

    // 3. Fetch Historical Data (Daily & Weekly)
    const historyDaily = await fetchHistory(symbol, 200, '1d');
    const historyWeekly = await fetchHistory(symbol, 200, '1wk');

    if (historyDaily.length < 50) {
      return { symbol, skipped: true, reason: 'Insufficient daily data' };
    }

    // 4. Calculate Indicators & Stats
    const indicatorsDaily = calculateIndicators(historyDaily);
    const indicatorsWeekly = historyWeekly.length >= 20 ? calculateIndicators(historyWeekly) : null;

    // 20-day Average Volume & Highest High
    const last20Days = historyDaily.slice(-20);
    const avgVolume20 = last20Days.reduce((acc, curr) => acc + (curr.volume || 0), 0) / 20;
    const highestHigh20 = Math.max(...last20Days.map(d => d.high));

    // Multi-Timeframe Confirmation
    let weeklyConfirmed = false;
    if (indicatorsWeekly) {
      // Weekly confirmation if Weekly price > Weekly SMA20 or RSI > 50
      weeklyConfirmed = indicatorsWeekly.lastClose > indicatorsWeekly.sma20 || indicatorsWeekly.rsi > 50;
    }

    // Calculate Sector RS
    let sectorRS = { sector: 'Lainnya', rsScore: 0, rank: 99, isTopTier: false };
    try {
      const sector = getSectorForTicker(symbol);
      const [rsData, sectorRankings] = await Promise.all([
        rsEngine.calculateStockRS(symbol, sector, historyDaily),
        rsEngine.getSectorPerformances()
      ]);
      const sectorData = sectorRankings[sector];

      sectorRS = {
        sector,
        rsScore: parseFloat(rsData.rsScore.toFixed(2)),
        rank: sectorData ? sectorData.rank : 99,
        isTopTier: sectorData ? sectorData.rank <= 3 : false
      };
    } catch (e) {
      logger.error(`[Recommender] Sector RS calculation failed for ${symbol}: ${e.message}`);
    }

    // 5. Run Analyzer
    const analysis = analyzeStock({
      symbol,
      history: historyDaily,
      indicators: indicatorsDaily,
      marketRegime,
      analystTrends: summary.recommendationTrend?.trend?.[0],
      avgVolume20,
      highestHigh20,
      weeklyConfirmed,
      sectorRS
    });

    if (analysis.skipped) return analysis;

    // 6. Optional ML overlay (no-op when model.json is absent)
    const ml = mlScorer.score({
      rsi: indicatorsDaily.rsi,
      atrPct: (indicatorsDaily.atr / price) * 100,
      smaSpread: ((indicatorsDaily.sma20 - indicatorsDaily.sma50) / indicatorsDaily.sma50) * 100,
      volRatio: Math.min(volume / (avgVolume20 || 1), 5),
      distHigh20: ((price - highestHigh20) / highestHigh20) * 100,
      macdHist: indicatorsDaily.macd?.histogram ?? 0,
      marketBullish: marketRegime.isBullish ? 1 : 0,
      weeklyConfirmed: weeklyConfirmed ? 1 : 0,
      confidence: analysis.confidence
    });

    return {
      symbol,
      name: summary.price?.longName || symbol,
      price: price,
      recommendation: analysis.recommendation,
      score: analysis.score,
      confidence: analysis.confidence,
      mlProb: ml ? ml.mlProb : null,
      mlScore: ml ? ml.mlScore : null,
      weightedScore: analysis.weightedScore,
      rsScore: analysis.rsScore || sectorRS.rsScore,
      sector: analysis.sector || sectorRS.sector,
      flags: analysis.flags,
      riskMgmt: analysis.riskMgmt,
      indicators: {
        rsi: indicatorsDaily.rsi?.toFixed(2),
        sma20: indicatorsDaily.sma20?.toFixed(2),
        sma50: indicatorsDaily.sma50?.toFixed(2),
        macd: indicatorsDaily.macd
      },
      weeklyConfirmed
    };

  } catch (error) {
    logger.error(`[Recommender] Error analyzing ${symbol}: ${error.message}`);
    return { symbol, error: error.message };
  }
}

module.exports = {
  getRecommendation,
  getMarketRegime
};
