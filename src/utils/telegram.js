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
    
    // Sort within sector by rule score (ML overlay is a market-timing gate, not a ranker)
    const sortedStocks = groups[sector].sort((a, b) => b.score - a.score);
    
    sortedStocks.forEach(r => {
      const trendEmoji = r.flags.includes('SMA Bullish') || r.flags.includes('Above SMA20') ? '📈' : '📉';
      const volumeEmoji = r.flags.includes('Volume Breakout') ? '🔥' : '☁️';
      
      message += `• <b>${r.symbol}</b> | Score: <b>${r.score}</b> | RS: <b>${r.rsScore > 0 ? '+' : ''}${r.rsScore.toFixed(1)}</b>\n`;
      message += `  💰 Ent: <b>${r.riskMgmt?.entry || 'N/A'}</b> | SL: <b>${r.riskMgmt?.sl || 'N/A'}</b>\n`;
      message += `  🎯 TP: <b>${r.riskMgmt?.tp1 || 'N/A'}</b> | ${trendEmoji} <b>${r.recommendation}</b> ${volumeEmoji}\n`;
      // Optional advisory layer. Never affects score, order, or label.
      if (r.sentiment) {
        const sEmoji = r.sentiment.label === 'positif' ? '🟢' : r.sentiment.label === 'negatif' ? '🔴' : '⚪';
        message += `  ${sEmoji} Sentimen: <b>${r.sentiment.label}</b> (${r.sentiment.score > 0 ? '+' : ''}${r.sentiment.score.toFixed(2)})\n`;
      }
      if (r.aiNote) {
        message += `  💬 <i>${escapeHTML(r.aiNote)}</i>\n`;
      }
      message += `\n`;
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
    if (r.mlScore != null) {
      message += `🤖 Prob naik 20d: <b>${r.mlScore}%</b>\n`;
    }
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
  
  const ihsg = market.analysis.ihsg_trend || {};
  message += `<b>1. IHSG Trend:</b> ${ihsg.status || 'UNKNOWN'}\n`;
  if (ihsg.price != null) {
    message += `└ Price: ${ihsg.price.toFixed(0)} (${ihsg.position})\n\n`;
  } else {
    message += `└ Data IHSG tidak tersedia\n\n`;
  }

  const breadth = market.analysis.market_breadth || {};
  message += `<b>2. Market Breadth:</b> ${breadth.status || 'UNKNOWN'}\n`;
  if (breadth.ad_ratio != null) {
    message += `└ A/D Ratio: ${breadth.ad_ratio} | >SMA50: ${breadth.pct_above_sma50}% | >SMA200: ${breadth.pct_above_sma200}%\n\n`;
  } else {
    message += `└ Data breadth tidak tersedia\n\n`;
  }

  const foreign = market.analysis.foreign_flow || {};
  message += `<b>3. Foreign Flow:</b> ${foreign.status || 'UNKNOWN'}\n`;
  message += `└ Daily: ${foreign.daily_net || 'N/A'}\n\n`;

  message += `<b>4. Sector Strength:</b>\n`;
  const sectors = market.analysis.sector_strength?.sectors || {};
  Object.keys(sectors).forEach(s => {
    const sEmoji = sectors[s].score > 0 ? '✅' : sectors[s].score < 0 ? '❌' : '⚪';
    message += `${sEmoji} ${s}: ${sectors[s].performance || 'N/A'}\n`;
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

/**
 * Telegram rejects messages over 4096 chars. Split on line boundaries so
 * HTML tags are never cut mid-tag.
 */
function chunkMessage(message, limit = 3800) {
  if (message.length <= limit) return [message];
  const chunks = [];
  let cur = '';
  for (const line of message.split('\n')) {
    if (cur.length + line.length + 1 > limit) {
      if (cur) chunks.push(cur);
      cur = line;
    } else {
      cur += (cur ? '\n' : '') + line;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

module.exports = {
  initBot,
  chunkMessage,
  formatAnalysisMessage,
  formatGroupedAnalysisMessage,
  formatMarketMessage,
  formatSectorLeadersMessage
};
