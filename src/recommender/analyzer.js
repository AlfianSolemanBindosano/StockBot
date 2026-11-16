'use strict';

/**
 * Perform comprehensive stock analysis based on weighted scoring.
 */
function analyzeStock(data) {
  const {
    symbol,
    history,
    indicators,
    marketRegime,
    analystTrends,
    avgVolume20,
    highestHigh20,
    weeklyConfirmed = false,
    sectorRS = { sector: 'Lainnya', rsScore: 0, rank: 99, isTopTier: false }
  } = data;

  const results = {
    symbol,
    score: 0,
    weightedScore: 0,
    confidence: 0,
    flags: [],
    reasons: [],
    recommendation: 'HOLD',
    riskMgmt: {},
    sector: sectorRS.sector,
    rsScore: sectorRS.rsScore
  };

  // 1. HARD FILTERS
  const lastClose = indicators.lastClose;
  const currentATR = indicators.atr;
  
  if (currentATR && (currentATR / lastClose) < 0.015) {
    return { symbol, skipped: true, reason: 'ATR/Price < 1.5% (Low volatility)' };
  }

  // Add SMA position flags directly here
  if (lastClose > indicators.sma20) results.flags.push('Above SMA20');
  if (lastClose > indicators.sma50) results.flags.push('Above SMA50');

  // 2. SCORING COMPONENTS
  let components = {
    marketTrend: 0,
    volume: 0,
    macd: 0,
    rsi: 0,
    smaTrend: 0,
    sentiment: 0
  };

  // 2.1 Market Trend (IHSG)
  if (marketRegime.isBullish) {
    components.marketTrend = 1;
    results.flags.push('Market Bullish');
  } else {
    components.marketTrend = -1;
    results.flags.push('Market Bearish');
  }

  // 2.2 Volume Confirmation
  const lastVolume = history[history.length - 1].volume;
  if (lastVolume > 1.5 * avgVolume20) {
    components.volume = 2;
    results.flags.push('Volume Breakout');
  } else if (lastVolume < 0.8 * avgVolume20) {
    components.volume = -1;
    results.flags.push('Weak Volume');
  }

  // 2.3 MACD
  if (indicators.macd) {
    const { MACD, signal, histogram } = indicators.macd;
    if (MACD > signal) {
      components.macd += 2; // Golden Cross / Bullish
      results.flags.push('MACD Bullish');
    } else {
      components.macd -= 2; // Death Cross / Bearish
      results.flags.push('MACD Bearish');
    }
    if (histogram > 0) components.macd += 1;
  }

  // 2.4 RSI
  if (indicators.rsi) {
    const rsi = indicators.rsi;
    if (rsi < 30) {
      components.rsi = 3;
      results.flags.push('RSI Oversold');
    } else if (rsi >= 30 && rsi <= 50) {
      components.rsi = 1;
      results.flags.push('RSI Moderately Bullish');
    } else if (rsi > 70) {
      components.rsi = -2;
      results.flags.push('RSI Overbought');
    }
  }

  // 2.5 SMA Trend
  if (indicators.sma20 > indicators.sma50) {
    components.smaTrend = 1;
    results.flags.push('SMA Bullish');
  } else {
    components.smaTrend = -1;
    results.flags.push('SMA Bearish');
  }

  // 2.6 Analyst Sentiment
  if (analystTrends) {
    if (analystTrends.strongBuy > 0) components.sentiment += 2;
    if (analystTrends.buy > 0) components.sentiment += 1;
    if (analystTrends.sell > 0) components.sentiment -= 1;
  }

  // 3. WEIGHTED SCORING SYSTEM
  // Market Trend 25%, Volume 20%, MACD 20%, RSI 15%, SMA Trend 10%, Sentiment 10%
  
  const rawScore = Object.values(components).reduce((a, b) => a + b, 0);
  
  // Weighted calculation (simplified normalization: positive = 1, negative = -1, neutral = 0)
  const getWeight = (val) => (val > 0 ? 1 : val < 0 ? -1 : 0);
  
  let weightedScore = 
    (getWeight(components.marketTrend) * 0.25) +
    (getWeight(components.volume) * 0.20) +
    (getWeight(components.macd) * 0.20) +
    (getWeight(components.rsi) * 0.15) +
    (getWeight(components.smaTrend) * 0.10) +
    (getWeight(components.sentiment) * 0.10);

  // Market Bearish Penalty
  if (!marketRegime.isBullish && weightedScore > 0) {
    weightedScore *= 0.7; // Reduce buy score by 30%
  }

  results.score = rawScore.toFixed(1);
  results.weightedScore = weightedScore.toFixed(2);
  
  // Confidence calculation (0-100%)
  // Map weightedScore (-1 to 1) to 0 to 100
  results.confidence = Math.max(0, Math.min(100, Math.round((weightedScore + 1) * 50)));

  // Sector Strength Bonus/Penalty on Confidence
  if (sectorRS.isTopTier) {
    results.flags.push('Top Tier Sector');
    results.confidence = Math.min(100, results.confidence + 5);
  } else if (sectorRS.rank >= 5) {
    results.confidence = Math.max(0, results.confidence - 5);
  }

  if (sectorRS.rsScore > 5) {
    results.flags.push('High Relative Strength');
  }
  if (sectorRS.rsScore > 10) {
    results.flags.push('Sector Leader');
  }

  // Weekly Trend Confirmation Bonus/Penalty on Confidence
  if (weeklyConfirmed) {
    results.flags.push('Weekly Confirmed');
    results.confidence = Math.min(100, results.confidence + 5);
  } else {
    results.confidence = Math.max(0, results.confidence - 5);
  }

  // 4. BREAKOUT DETECTION
  const isBreakout = lastClose > highestHigh20 && lastVolume > 1.2 * avgVolume20;
  if (isBreakout) {
    results.flags.push('Breakout Valid');
    // Boost score if breakout
    results.confidence = Math.min(100, results.confidence + 10);
  }

  // 5. RISK MANAGEMENT
  if (currentATR) {
    results.riskMgmt = {
      entry: `${(lastClose * 0.995).toFixed(0)} - ${(lastClose * 1.005).toFixed(0)}`,
      sl: (lastClose - (2 * currentATR)).toFixed(0),
      tp1: (lastClose + (1.5 * currentATR)).toFixed(0),
      tp2: (lastClose + (3 * currentATR)).toFixed(0)
    };
    
    const risk = lastClose - results.riskMgmt.sl;
    const reward = results.riskMgmt.tp2 - lastClose;
    results.riskMgmt.rr = (reward / risk).toFixed(1);
  }

  // 6. RECOMMENDATION CATEGORY
  const isBullishTrend = lastClose > indicators.sma50 && indicators.sma20 > indicators.sma50;
  if (results.confidence > 80 && isBullishTrend && weeklyConfirmed) {
    results.recommendation = 'STRONG BUY';
  } else if (results.confidence > 65) {
    results.recommendation = 'BUY';
  } else if (results.confidence < 25) {
    results.recommendation = 'STRONG SELL';
  } else if (results.confidence < 40) {
    results.recommendation = 'SELL';
  } else {
    results.recommendation = 'HOLD';
  }

  // 7. RISK/REWARD RATIO FILTER
  if ((results.recommendation === 'STRONG BUY' || results.recommendation === 'BUY') && results.riskMgmt?.rr) {
    const rrRatio = parseFloat(results.riskMgmt.rr);
    if (rrRatio < 1.5) {
      results.recommendation = 'HOLD';
      results.flags.push('Poor Risk/Reward');
    }
  }

  return results;
}

module.exports = {
  analyzeStock
};
