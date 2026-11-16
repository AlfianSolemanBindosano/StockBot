'use strict';

const { fetchHistory } = require('../utils/yahoo');
const logger = require('../utils/logger');
const { SECTOR_PROXIES } = require('../utils/sectorMapping');

const CACHE_TTL_MS = 3600000; // 1 hour
const HISTORY_DAYS = 200;

class RSEngine {
  constructor() {
    this.timeframes = [
      { label: '1W', days: 5, weight: 0.2 },
      { label: '2W', days: 10, weight: 0.1 },
      { label: '1M', days: 20, weight: 0.4 },
      { label: '3M', days: 60, weight: 0.3 }
    ];
    this.sectorPerformanceCache = null;
    this.sectorPerformanceAt = 0;
    this.ihsgPerformanceCache = null;
    this.ihsgPerformanceAt = 0;
  }

  /**
   * Calculate return percentage from history
   */
  calculateReturn(history, days) {
    // History is usually daily. We need enough bars.
    if (!history || history.length < days + 1) return 0;
    const current = history[history.length - 1].close;
    const past = history[history.length - 1 - days].close;
    return ((current - past) / past) * 100;
  }

  /**
   * Get IHSG performance for all timeframes
   */
  async getIHSGPerformance() {
    if (this.ihsgPerformanceCache && Date.now() - this.ihsgPerformanceAt < CACHE_TTL_MS) {
      return this.ihsgPerformanceCache;
    }

    try {
      const history = await fetchHistory('^JKSE', HISTORY_DAYS);

      const performance = {};
      this.timeframes.forEach(tf => {
        performance[tf.label] = this.calculateReturn(history, tf.days);
      });

      this.ihsgPerformanceCache = performance;
      this.ihsgPerformanceAt = Date.now();
      return performance;
    } catch (err) {
      logger.error(`[RSEngine] Error fetching IHSG history: ${err.message}`);
      return { '1W': 0, '2W': 0, '1M': 0, '3M': 0 };
    }
  }

  /**
   * Get sector performance based on proxies
   */
  async getSectorPerformances() {
    if (this.sectorPerformanceCache && Date.now() - this.sectorPerformanceAt < CACHE_TTL_MS) {
      return this.sectorPerformanceCache;
    }

    const sectorPerformances = {};
    const ihsgPerf = await this.getIHSGPerformance();

    for (const [sector, tickers] of Object.entries(SECTOR_PROXIES)) {
      try {
        // Fetch history for each proxy ticker and average them
        const proxyResults = await Promise.all(tickers.map(async (ticker) => {
          try {
            const history = await fetchHistory(ticker, HISTORY_DAYS);
            const perf = {};
            this.timeframes.forEach(tf => {
              perf[tf.label] = this.calculateReturn(history, tf.days);
            });
            
            // SMA Check
            const closes = history.map(h => h.close).filter(c => !!c);
            const lastClose = closes[closes.length - 1];
            const sma20 = closes.length >= 20 ? closes.slice(-20).reduce((a, b) => a + b, 0) / 20 : 0;
            const sma50 = closes.length >= 50 ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 : 0;

            return { 
              perf, 
              aboveSMA20: lastClose > sma20, 
              aboveSMA50: lastClose > sma50 
            };
          } catch (e) {
            return null;
          }
        }));

        const validResults = proxyResults.filter(r => r !== null);
        if (validResults.length === 0) {
          sectorPerformances[sector] = { '1W': 0, '2W': 0, '1M': 0, '3M': 0, rsScore: 0, rank: 0 };
          continue;
        }

        const avgPerf = {};
        let totalRS = 0;
        let aboveSMA20Count = 0;
        let aboveSMA50Count = 0;

        this.timeframes.forEach(tf => {
          const sum = validResults.reduce((acc, curr) => acc + curr.perf[tf.label], 0);
          avgPerf[tf.label] = sum / validResults.length;
          
          const rs = avgPerf[tf.label] - ihsgPerf[tf.label];
          totalRS += rs * tf.weight;
        });

        validResults.forEach(r => {
          if (r.aboveSMA20) aboveSMA20Count++;
          if (r.aboveSMA50) aboveSMA50Count++;
        });

        sectorPerformances[sector] = {
          performance: avgPerf,
          rsScore: totalRS,
          aboveSMA20: aboveSMA20Count / validResults.length >= 0.5, // Majority above SMA
          aboveSMA50: aboveSMA50Count / validResults.length >= 0.5
        };
      } catch (err) {
        logger.error(`[RSEngine] Error calculating sector ${sector}: ${err.message}`);
      }
    }

    // Rank sectors by rsScore
    const rankedSectors = Object.entries(sectorPerformances)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.rsScore - a.rsScore);

    rankedSectors.forEach((s, index) => {
      s.rank = index + 1;
      sectorPerformances[s.name].rank = index + 1;
    });

    this.sectorPerformanceCache = sectorPerformances;
    this.sectorPerformanceAt = Date.now();
    return sectorPerformances;
  }

  /**
   * Calculate Stock RS vs its Sector
   */
  async calculateStockRS(symbol, sectorName, stockHistory) {
    const sectorPerfs = await this.getSectorPerformances();
    const sectorData = sectorPerfs[sectorName];

    if (!sectorData) {
      // If sector unknown, compare vs IHSG
      const ihsgPerf = await this.getIHSGPerformance();
      let totalRS = 0;
      this.timeframes.forEach(tf => {
        const stockReturn = this.calculateReturn(stockHistory, tf.days);
        const rs = stockReturn - ihsgPerf[tf.label];
        totalRS += rs * tf.weight;
      });
      return { rsScore: totalRS, benchmark: 'IHSG' };
    }

    let totalRS = 0;
    this.timeframes.forEach(tf => {
      const stockReturn = this.calculateReturn(stockHistory, tf.days);
      const rs = stockReturn - sectorData.performance[tf.label];
      totalRS += rs * tf.weight;
    });

    return { rsScore: totalRS, benchmark: sectorName };
  }
}

module.exports = new RSEngine();
