'use strict';

require('dotenv').config();

const logger = require('./src/utils/logger');
const { getRecommendation } = require('./src/recommender/recommender');
const { withRetry } = require('./src/utils/helpers');
const { initBot, formatAnalysisMessage, formatMarketMessage } = require('./src/utils/telegram');
const { IDX_TICKERS } = require('./src/utils/idxTickers');
const marketEngine = require('./src/recommender/marketEngine');
const fs = require('fs');
const path = require('path');

// ─── Bot Initialization ──────────────────────────────────────────────────────
const bot = initBot();

if (!bot) {
  logger.error('[Main] Failed to initialize Telegram bot. Exiting...');
  process.exit(1);
}

// ─── Process handlers ─────────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  logger.error(`[Main] Unhandled rejection: ${reason}`);
});

process.on('SIGINT', () => {
  logger.info('[Main] SIGINT received. Shutting down...');
  process.exit(0);
});

// ─── Analysis Logic ──────────────────────────────────────────────────────────
async function runAnalysis(maxPriceOverride = null) {
  const startTime = Date.now();
  
  let symbols = (process.env.STOCK_SYMBOLS || 'BBCA.JK').split(',');
  
  if (symbols.length === 1 && symbols[0].toUpperCase() === 'ALL') {
    logger.info(`[Analysis] Using all IDX tickers (${IDX_TICKERS.length} symbols).`);
    symbols = IDX_TICKERS;
  }

  const limit = maxPriceOverride || process.env.MAX_STOCK_PRICE || '500';
  logger.info(`[Analysis] Starting analysis for ${symbols.length} symbols (Max Price: ${limit})...`);
  const results = [];

  for (const symbol of symbols) {
    const cleanSymbol = symbol.trim();
    if (!cleanSymbol) continue;

    try {
      const recommendation = await withRetry(
        () => getRecommendation(cleanSymbol, maxPriceOverride),
        parseInt(process.env.MAX_RETRIES || '1', 10), // Lower retries for bulk
        `Analysis for ${cleanSymbol}`
      );
      results.push(recommendation);
    } catch (err) {
      logger.error(`[Analysis] ❌ Failed to analyze ${cleanSymbol}: ${err.message}`);
    }
  }

  // Filter out skipped stocks and errors
  const finalResults = results.filter(r => !r.skipped && !r.error);

  // Sort by score descending
  finalResults.sort((a, b) => b.score - a.score);

  // Save to latest.json
  const outputDir = process.env.OUTPUT_DIR || './output';
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'latest.json'), JSON.stringify(finalResults, null, 2));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info(`[Analysis] ✅ Completed in ${elapsed}s. ${finalResults.length} stocks passed filter.`);
  
  return finalResults;
}

// ─── Telegram Event Listeners ────────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  logger.info(`[Telegram] Received /start from Chat ID: ${chatId}`);
  bot.sendMessage(chatId, 'Selamat datang di StockBot! 📈\nKirimkan perintah /saham atau /saham [harga_maks] (contoh: /saham 1000) untuk mendapatkan rekomendasi terbaru.');
});

bot.onText(/\/saham(?:\s+(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const maxPriceOverride = match[1] ? parseInt(match[1], 10) : null;
  
  logger.info(`[Telegram] Received /saham from Chat ID: ${chatId}${maxPriceOverride ? ` with maxPrice: ${maxPriceOverride}` : ''}`);
  
  if (process.env.TELEGRAM_CHAT_ID && chatId.toString() !== process.env.TELEGRAM_CHAT_ID.toString()) {
    logger.warn(`[Telegram] Unauthorized request from Chat ID: ${chatId} (Expected: ${process.env.TELEGRAM_CHAT_ID})`);
    bot.sendMessage(chatId, `❌ Maaf, Anda tidak memiliki akses ke bot ini. Chat ID Anda: ${chatId}`);
    return;
  }

  const defaultLimit = process.env.MAX_STOCK_PRICE || '500';
  const currentLimit = maxPriceOverride || defaultLimit;

  bot.sendMessage(chatId, `🔍 Menganalisis Market Regime & IDX Stocks (Price ≤ ${currentLimit})... ⏳`);
  
  // 1. Analyze Market Regime First
  try {
    const marketAnalysis = await marketEngine.analyzeMarket();
    const marketMsg = formatMarketMessage(marketAnalysis);
    await bot.sendMessage(chatId, marketMsg, { parse_mode: 'HTML' });

    // If market is extremely risky, add a warning
    if (marketAnalysis.market_regime === 'HIGH RISK BEARISH' || marketAnalysis.market_regime === 'BEARISH') {
      await bot.sendMessage(chatId, '⚠️ <b>WARNING:</b> Market sangat berisiko. Menampilkan rekomendasi saham hanya untuk pantauan atau fast scalp.', { parse_mode: 'HTML' });
    }
  } catch (err) {
    logger.error(`[Telegram] Market analysis failed: ${err.message}`);
  }

  // 2. Run Stock Analysis
  const results = await runAnalysis(maxPriceOverride);
  
  if (results.length > 0) {
    // RS ENHANCEMENT: Send Sector Leaders
    try {
      const { formatSectorLeadersMessage } = require('./src/utils/telegram');
      const leadersMsg = formatSectorLeadersMessage(results);
      if (leadersMsg) {
        await bot.sendMessage(chatId, leadersMsg, { parse_mode: 'HTML' });
      }
    } catch (err) {
      logger.error(`[Telegram] Sector leaders message failed: ${err.message}`);
    }

    // Send Grouped Results
    const topResults = results.slice(0, 20); // Show top 20 best stocks across all sectors
    logger.info(`[Telegram] Sending ${topResults.length} grouped recommendations to Chat ID: ${chatId}...`);
    
    try {
      const { formatGroupedAnalysisMessage } = require('./src/utils/telegram');
      const response = formatGroupedAnalysisMessage(topResults);
      await bot.sendMessage(chatId, response, { parse_mode: 'HTML' });
    } catch (err) {
      logger.error(`[Telegram] Failed to send grouped results: ${err.message}`);
      // Fallback to legacy chunked if grouping fails
      const chunkSize = 10;
      for (let i = 0; i < topResults.length; i += chunkSize) {
        const chunk = topResults.slice(i, i + chunkSize);
        const response = formatAnalysisMessage(chunk, i + 1);
        await bot.sendMessage(chatId, response, { parse_mode: 'HTML' });
      }
    }
    
    if (results.length > 20) {
      bot.sendMessage(chatId, `<i>Note: Menampilkan 20 saham terbaik berdasarkan score dari total ${results.length} saham yang ditemukan.</i>`, { parse_mode: 'HTML' });
    }
  } else {
    bot.sendMessage(chatId, `❌ Tidak ditemukan saham dengan harga ≤ ${currentLimit} yang memenuhi kriteria sistem saat ini.`);
  }
});

logger.info('╔══════════════════════════════════════════════╗');
logger.info('║    INTERACTIVE STOCK BOT  –  v2.6.1          ║');
logger.info('╚══════════════════════════════════════════════╝');
logger.info('[Main] Bot is running and waiting for commands...');
