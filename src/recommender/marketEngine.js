'use strict';

const { yf, fetchHistory } = require('../utils/yahoo');
const { SMA } = require('technicalindicators');
const logger = require('../utils/logger');

class IDXQuantTradingEngine {
  constructor() {
    this.sectors = {
      Financial: ['BBCA.JK', 'BBRI.JK', 'BMRI.JK', 'BBNI.JK'],
      Technology: ['GOTO.JK', 'BUKA.JK', 'EMTK.JK'],
      Energy: ['ADRO.JK', 'ITMG.JK', 'PTBA.JK', 'MEDC.JK'],
      BasicMaterials: ['TPIA.JK', 'BRPT.JK', 'MDKA.JK', 'ANTM.JK'],
      Infrastructure: ['TLKM.JK', 'JSMR.JK', 'EXCL.JK', 'ISAT.JK'],
      Consumer: ['ICBP.JK', 'INDF.JK', 'UNVR.JK', 'AMRT.JK']
    };
  }

  async analyzeMarket() {
    logger.info('[MarketEngine] Starting full market analysis...');
    
    const [ihsgData, breadthData, sectorData] = await Promise.all([
      this.getIHSGTrend(),
      this.getMarketBreadth(),
      this.getSectorStrength()
    ]);

    // RS ENHANCEMENT: Get detailed sector rankings
    let sectorRankings = [];
    try {
      const rsEnhancer = require('./rsEnhancer');
      sectorRankings = await rsEnhancer.getSectorRankings();
    } catch (e) {
      logger.error(`[MarketEngine] RS Ranking failed: ${e.message}`);
    }

    // For Foreign Flow, we'll try to fetch recent news or use a placeholder if unavailable
    const foreignFlow = await this.getForeignFlow();

    const score = this.calculateTotalScore(ihsgData, breadthData, foreignFlow, sectorData);
    const classification = this.getClassification(score);
    const riskMode = this.getRiskMode(classification);

    return {
      market_regime: classification,
      market_score: score,
      confidence: 85, // Static for now
      market_bias: score > 0 ? 'BULLISH' : 'BEARISH',
      analysis: {
        ihsg_trend: ihsgData,
        market_breadth: breadthData,
        foreign_flow: foreignFlow,
        sector_strength: sectorData,
        sector_rankings: sectorRankings // New field
      },
      risk_mode: riskMode,
      trading_recommendation: this.getTradingRecommendation(riskMode)
    };
  }

  async getIHSGTrend() {
    try {
      const quotes = await fetchHistory('^JKSE', 200);
      const closes = quotes.map(h => h.close).filter(c => !!c);
      const sma20 = SMA.calculate({ values: closes, period: 20 }).pop();
      const sma50 = SMA.calculate({ values: closes, period: 50 }).pop();
      const lastClose = closes[closes.length - 1];

      let status = 'NEUTRAL';
      let score = 0;

      if (lastClose > sma20 && sma20 > sma50) {
        status = lastClose > sma20 * 1.02 ? 'STRONG BULLISH' : 'BULLISH';
        score = lastClose > sma20 * 1.02 ? 30 : 20;
      } else if (lastClose < sma20 && sma20 < sma50) {
        status = lastClose < sma20 * 0.98 ? 'STRONG BEARISH' : 'BEARISH';
        score = lastClose < sma20 * 0.98 ? -30 : -20;
      } else {
        status = 'NEUTRAL';
        score = 0;
      }

      return {
        price: lastClose,
        sma20,
        sma50,
        position: lastClose > sma20 ? 'Above SMA20' : 'Below SMA20',
        momentum: sma20 > sma50 ? 'Positive' : 'Negative',
        status,
        score
      };
    } catch (e) {
      logger.error(`[MarketEngine] IHSG error: ${e.message}`);
      return { status: 'UNKNOWN', score: 0 };
    }
  }

  async getMarketBreadth() {
    // We'll sample liquid stocks for breadth calculation
    const sampleTickers = [
      'BBCA.JK', 'BBRI.JK', 'BMRI.JK', 'ASII.JK', 'TLKM.JK', 'GOTO.JK', 'ADRO.JK', 'UNVR.JK',
      'ICBP.JK', 'MDKA.JK', 'ANTM.JK', 'PGAS.JK', 'ITMG.JK', 'HRUM.JK', 'UNTR.JK', 'AMRT.JK',
      'BBNI.JK', 'BRPT.JK', 'TPIA.JK', 'CPIN.JK', 'KLBF.JK', 'INCO.JK', 'SMGR.JK', 'INDF.JK',
      'INKP.JK', 'TKIM.JK', 'EXCL.JK', 'ISAT.JK', 'JSMR.JK', 'AKRA.JK', 'MEDC.JK', 'BRIS.JK',
      'ARTO.JK', 'MAPI.JK', 'ACES.JK', 'CTRA.JK', 'BSDE.JK', 'PWON.JK', 'SMRA.JK', 'SCMA.JK'
    ];

    try {
      const quotes = await yf.quote(sampleTickers);

      let advance = 0;
      let decline = 0;
      let aboveSMA50 = 0;
      let aboveSMA200 = 0;
      let counted = 0;

      for (const q of quotes) {
        if (q.regularMarketChange > 0) advance++;
        else if (q.regularMarketChange < 0) decline++;

        const px = q.regularMarketPrice;
        if (px == null) continue;
        counted++;
        if (q.fiftyDayAverage != null && px > q.fiftyDayAverage) aboveSMA50++;
        if (q.twoHundredDayAverage != null && px > q.twoHundredDayAverage) aboveSMA200++;
      }

      const adRatio = advance / (decline || 1);
      const pctAboveSMA50 = counted ? (aboveSMA50 / counted) * 100 : 0;
      const pctAboveSMA200 = counted ? (aboveSMA200 / counted) * 100 : 0;

      let status = 'Neutral Breadth';
      let score = 0;

      if (adRatio > 1.5 && pctAboveSMA50 > 60) {
        status = adRatio > 2.5 ? 'Very Strong Breadth' : 'Strong Breadth';
        score = adRatio > 2.5 ? 25 : 15;
      } else if (adRatio < 1 || pctAboveSMA50 < 40) {
        status = adRatio < 0.5 ? 'Very Weak Breadth' : 'Weak Breadth';
        score = adRatio < 0.5 ? -25 : -15;
      }

      return {
        advance,
        decline,
        ad_ratio: adRatio.toFixed(2),
        pct_above_sma50: pctAboveSMA50.toFixed(1),
        pct_above_sma200: pctAboveSMA200.toFixed(1),
        status,
        score
      };
    } catch (e) {
      logger.error(`[MarketEngine] Breadth error: ${e.message}`);
      return { status: 'UNKNOWN', score: 0 };
    }
  }

  async getForeignFlow() {
    try {
      const topForeign = await yf.quote(['BBCA.JK', 'BBRI.JK', 'BMRI.JK']);
      const avgChange = topForeign.reduce((acc, q) => acc + (q.regularMarketChangePercent || 0), 0) / 3;
      
      let status = 'Neutral';
      let score = 0;

      if (avgChange > 1.0) {
        status = 'Strong Accumulation';
        score = 25;
      } else if (avgChange > 0.3) {
        status = 'Moderate Buy';
        score = 15;
      } else if (avgChange < -1.0) {
        status = 'Heavy Distribution';
        score = -25;
      } else if (avgChange < -0.3) {
        status = 'Moderate Sell';
        score = -15;
      }

      return {
        daily_net: avgChange > 0 ? 'POSITIVE (Proxy)' : 'NEGATIVE (Proxy)',
        weekly_consistency: 'N/A',
        status,
        score
      };
    } catch (e) {
      return { status: 'Neutral', score: 0 };
    }
  }

  async getSectorStrength() {
    const results = {};
    let totalScore = 0;

    for (const [sector, tickers] of Object.entries(this.sectors)) {
      try {
        const quotes = await yf.quote(tickers);
        const avgPerf = quotes.reduce((acc, q) => acc + (q.regularMarketChangePercent || 0), 0) / tickers.length;
        
        let status = 'Neutral';
        let score = 0;

        if (avgPerf > 1.0) {
          status = 'Leading Sector';
          score = 20;
        } else if (avgPerf > 0.3) {
          status = 'Strong Sector';
          score = 10;
        } else if (avgPerf < -1.0) {
          status = 'Lagging Sector';
          score = -20;
        } else if (avgPerf < -0.3) {
          status = 'Weak Sector';
          score = -10;
        }

        results[sector] = { performance: avgPerf.toFixed(2) + '%', status, score };
        totalScore += score;
      } catch (e) {
        results[sector] = { status: 'UNKNOWN', score: 0 };
      }
    }

    return {
      sectors: results,
      score: Math.round(totalScore / Object.keys(this.sectors).length)
    };
  }

  calculateTotalScore(ihsg, breadth, foreign, sectors) {
    return ihsg.score + breadth.score + foreign.score + sectors.score;
  }

  getClassification(score) {
    if (score >= 70) return 'STRONG BULLISH';
    if (score >= 40) return 'BULLISH';
    if (score >= 10) return 'NEUTRAL';
    if (score >= -10) return 'DEFENSIVE';
    if (score >= -39) return 'BEARISH';
    return 'HIGH RISK BEARISH';
  }

  getRiskMode(classification) {
    const modes = {
      'STRONG BULLISH': 'Agresif - Full momentum trading diperbolehkan',
      'BULLISH': 'Normal Risk',
      'NEUTRAL': 'Kurangi posisi - Fokus quick trade',
      'DEFENSIVE': 'Defensive Mode - Hindari breakout lemah',
      'BEARISH': 'Defensive Mode - Prioritas cash',
      'HIGH RISK BEARISH': 'Hindari long position - Hanya fast scalp jika sangat perlu'
    };
    return modes[classification] || 'UNKNOWN';
  }

  getTradingRecommendation(riskMode) {
    if (riskMode.includes('Agresif')) return 'Market sangat kondusif. Prioritaskan saham breakout dengan volume tinggi.';
    if (riskMode.includes('Normal')) return 'Market sehat. Cari setup swing trading pada saham leading sector.';
    if (riskMode.includes('Kurangi')) return 'Market bimbang. Kurangi porsi dana, fokus pada fast trade di saham volatilitas tinggi.';
    if (riskMode.includes('Defensive')) return 'Market lemah. Fokus menjaga modal (Capital Preservation).';
    return 'High Risk. Wait and see adalah pilihan terbaik.';
  }

  getStartDate(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  }
}

module.exports = new IDXQuantTradingEngine();
