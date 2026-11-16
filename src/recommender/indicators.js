'use strict';

const { RSI, SMA, MACD, ATR } = require('technicalindicators');

/**
 * Calculate technical indicators for a given set of historical prices.
 * @param {Array<Object>} history - Array of OHLCV data.
 * @returns {Object} Calculated indicators.
 */
function calculateIndicators(history) {
  if (!history || history.length < 50) {
    return { error: 'Insufficient data for indicators' };
  }

  const closes = history.map(h => h.close);
  const highs = history.map(h => h.high);
  const lows = history.map(h => h.low);

  // RSI (11)
  const rsiValues = RSI.calculate({
    values: closes,
    period: 11
  });
  const currentRSI = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : null;

  // SMA 20 & SMA 50
  const sma20Values = SMA.calculate({ values: closes, period: 20 });
  const sma50Values = SMA.calculate({ values: closes, period: 50 });

  const currentSMA20 = sma20Values.length > 0 ? sma20Values[sma20Values.length - 1] : null;
  const currentSMA50 = sma50Values.length > 0 ? sma50Values[sma50Values.length - 1] : null;

  // MACD (12, 26, 9)
  const macdValues = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  });
  const currentMACD = macdValues.length > 0 ? macdValues[macdValues.length - 1] : null;

  // ATR (14)
  const atrValues = ATR.calculate({
    high: highs,
    low: lows,
    close: closes,
    period: 14
  });
  const currentATR = atrValues.length > 0 ? atrValues[atrValues.length - 1] : null;

  return {
    rsi: currentRSI,
    sma20: currentSMA20,
    sma50: currentSMA50,
    macd: currentMACD,
    atr: currentATR,
    lastClose: closes[closes.length - 1]
  };
}

module.exports = {
  calculateIndicators
};
