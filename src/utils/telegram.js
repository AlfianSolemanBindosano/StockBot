'use strict';

const TelegramBot = require('node-telegram-bot-api');
const logger = require('./logger');
const { escapeHTML } = require('./helpers');

/**
 * Initialize and return the Telegram bot instance.
 */
function initBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.error('[Telegram] TELEGRAM_BOT_TOKEN is not set in .env');
    return null;
  }

  // Use polling
  const bot = new TelegramBot(token, { polling: false });
  
  bot.deleteWebHook().then(() => {
    bot.startPolling();
    logger.info('[Telegram] Bot initialized and polling for messages.');
  });

  return bot;
}

/**
 * Helper to format analysis results grouped by sector.
 */
function formatGroupedAnalysisMessage(results) {
  // Group by sector
  const groups = {};
  results.forEach(r => {
    const sector = r.sector || 'Lainnya';
    if (!groups[sector]) groups[sector] = [];
    groups[sector].push(r);
  });

  let message = '📑 <b>HASIL ANALISIS PER SEKTOR</b>\n';
  message += '━━━━━━━━━━━━━━━━━━━━\n\n';

  Object.keys(groups).forEach(sector => {
    message += `📂 <b>SEKTOR: ${sector.toUpperCase()}</b>\n`;
    
    // Sort within sector by score
    const sortedStocks = groups[sector].sort((a, b) => b.score - a.score);
    
    sortedStocks.forEach(r => {
      const trendEmoji = r.flags.includes('SMA Bullish') || r.flags.includes('Above SMA20') ? '📈' : '📉';
      const volumeEmoji = r.flags.includes('Volume Breakout') ? '🔥' : '☁️';
      
      message += `• <b>${r.symbol}</b> | Score: <b>${r.score}</b> | RS: <b>${r.rsScore > 0 ? '+' : ''}${r.rsScore.toFixed(1)}</b>\n`;
      message += `  💰 Ent: <b>${r.riskMgmt?.entry || 'N/A'}</b> | SL: <b>${r.riskMgmt?.sl || 'N/A'}</b>\n`;
      message += `  🎯 TP: <b>${r.riskMgmt?.tp1 || 'N/A'}</b> | ${trendEmoji} <b>${r.recommendation}</b> ${volumeEmoji}\n\n`;
    });
    
    message += `----------------------------\n`;
  });

  return message;
}

/**
 * Helper to format analysis results for Telegram in a concise way (Legacy/Chunked).
 */
function formatAnalysisMessage(results, startIndex = 1) {
  let message = '';

  results.forEach((r, i) => {
    if (r.error) return;

    const trendEmoji = r.flags.includes('SMA Bullish') ? '📈' : '📉';
    const volumeEmoji = r.flags.includes('Volume Breakout') ? '🔥' : '☁️';
    
    message += `🚀 <b>${r.symbol}</b> (${escapeHTML(r.name)})\n`;
    message += `📊 Score: <b>${r.score}</b> | 🎯 Conf: <b>${r.confidence}%</b>\n`;
    message += `💰 Entry: <b>${r.riskMgmt?.entry || 'N/A'}</b> | 🛑 SL: <b>${r.riskMgmt?.sl || 'N/A'}</b>\n`;
    message += `🎯 TP: <b>${r.riskMgmt?.tp1 || 'N/A'}</b> / <b>${r.riskMgmt?.tp2 || 'N/A'}</b>\n`;
    message += `⚖️ RR: <b>1:${r.riskMgmt?.rr || '0.0'}</b> | ${trendEmoji} <b>${trendEmoji === '📈' ? 'Bullish' : 'Bearish'}</b> ${volumeEmoji}\n\n`;
    
    message += `🧠 <b>${r.recommendation}</b>: `;
    if (r.flags.includes('Breakout Valid')) {
      message += `Konfirmasi breakout volume kuat.`;
    } else if (r.flags.includes('RSI Oversold')) {
      message += `Kondisi oversold, potensi rebound.`;
    } else {
      message += `Sinyal ${r.recommendation.toLowerCase()} terdeteksi.`;
    }
    
    message += `\n\n----------------------------\n\n`;
  });

  return message;
}

/**
 * Format market analysis result for Telegram.
 */
function formatMarketMessage(market) {
  const emoji = market.market_bias === 'BULLISH' ? '🟢' : '🔴';
  let message = `<b>${emoji} MARKET ANALYSIS: ${market.market_regime}</b>\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📊 Score: <b>${market.market_score}</b> | Bias: <b>${market.market_bias}</b>\n`;
  message += `💡 Mode: <i>${market.risk_mode}</i>\n\n`;
  
  message += `<b>1. IHSG Trend:</b> ${market.analysis.ihsg_trend.status}\n`;
  message += `└ Price: ${market.analysis.ihsg_trend.price.toFixed(0)} (${market.analysis.ihsg_trend.position})\n\n`;
  
  message += `<b>2. Market Breadth:</b> ${market.analysis.market_breadth.status}\n`;
  message += `└ A/D Ratio: ${market.analysis.market_breadth.ad_ratio} | >SMA20: ${market.analysis.market_breadth.pct_above_sma20}%\n\n`;
  
  message += `<b>3. Foreign Flow:</b> ${market.analysis.foreign_flow.status}\n`;
  message += `└ Daily: ${market.analysis.foreign_flow.daily_net}\n\n`;
  
  message += `<b>4. Sector Strength:</b>\n`;
  const sectors = market.analysis.sector_strength.sectors;
  Object.keys(sectors).forEach(s => {
    const sEmoji = sectors[s].score > 0 ? '✅' : sectors[s].score < 0 ? '❌' : '⚪';
    message += `${sEmoji} ${s}: ${sectors[s].performance}\n`;
  });

  // RS ENHANCEMENT: Sector Ranking
  if (market.analysis.sector_rankings && market.analysis.sector_rankings.length > 0) {
    message += `\n📊 <b>SECTOR RANKING (RS vs IHSG)</b>\n`;
    market.analysis.sector_rankings.slice(0, 5).forEach((s, i) => {
      const rsPrefix = s.rsScore > 0 ? '+' : '';
      message += `${i + 1}. ${s.name} (<b>${rsPrefix}${s.rsScore.toFixed(1)} RS</b>)\n`;
    });
  }
  
  message += `\n📝 <b>Recommendation:</b>\n<i>${market.trading_recommendation}</i>`;
  
  return message;
}

/**
 * Format sector leaders based on stock results.
 */
function formatSectorLeadersMessage(results) {
  // Group by sector
  const sectorGroups = {};
  results.forEach(r => {
    if (!r.sector || r.sector === 'Unknown') return;
    if (!sectorGroups[r.sector]) sectorGroups[r.sector] = [];
    sectorGroups[r.sector].push(r);
  });

  // Sort sectors by their top stock's RS score (or just keep them)
  // For each sector, sort stocks by RS score
  let message = `🚀 <b>SECTOR LEADERS (Stock vs Sector)</b>\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  let hasLeaders = false;
  Object.keys(sectorGroups).forEach(sector => {
    const stocks = sectorGroups[sector]
      .sort((a, b) => b.rsScore - a.rsScore)
      .slice(0, 3); // Top 3 per sector

    if (stocks.length > 0) {
      hasLeaders = true;
      message += `<b>${sector}:</b>\n`;
      stocks.forEach(s => {
        const rsPrefix = s.rsScore > 0 ? '+' : '';
        message += `• ${s.symbol}: <b>${rsPrefix}${s.rsScore.toFixed(1)} RS</b>\n`;
      });
      message += `\n`;
    }
  });

  if (!hasLeaders) return null;

  return message;
}

module.exports = {
  initBot,
  formatAnalysisMessage,
  formatGroupedAnalysisMessage,
  formatMarketMessage,
  formatSectorLeadersMessage
};
