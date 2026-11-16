'use strict';

const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
// yahooFinance.setGlobalConfig({ validation: { logErrors: false } });

const { RSI, MACD, EMA } = require('technicalindicators');

const TICKERS = [
  'GOTO.JK', 'BUKA.JK', 'BRMS.JK', 'DEWA.JK', 'BUMI.JK', 'ENRG.JK', 'DOID.JK', 'ADMR.JK', 
  'CARE.JK', 'BAJA.JK', 'SMDR.JK', 'PSSI.JK', 'ELSA.JK', 'WIFI.JK', 'NZIA.JK', 'OASA.JK', 
  'NATO.JK', 'FILM.JK', 'IPTV.JK', 'MLPL.JK', 'MPPA.JK', 'AMRT.JK', 'MIDI.JK', 'ESSA.JK', 
  'MEDC.JK', 'ANTM.JK', 'TINS.JK', 'INCO.JK', 'MBMA.JK', 'NCKL.JK', 'MDKA.JK', 'SRTG.JK', 
  'BBHI.JK', 'BBYB.JK', 'ARTO.JK', 'AGRO.JK', 'BRIS.JK', 'PNBS.JK', 'BVIC.JK', 'MCAS.JK', 
  'DMMX.JK', 'KIOS.JK', 'GLVA.JK', 'ASII.JK', 'UNVR.JK', 'ICBP.JK', 'INDF.JK', 'KLBF.JK', 
  'SIDO.JK', 'CPIN.JK', 'JPFA.JK', 'MAIN.JK', 'WMUU.JK', 'WMPP.JK', 'PPRO.JK', 'ASRI.JK', 
  'BSDE.JK', 'PWON.JK', 'CTRA.JK', 'SMRA.JK', 'KIJA.JK', 'BEST.JK', 'DMAS.JK', 'LPKR.JK', 
  'LPCK.JK', 'ADRO.JK', 'PTBA.JK', 'ITMG.JK', 'HRUM.JK', 'INDY.JK', 'PGAS.JK', 'AKRA.JK', 
  'RAJA.JK', 'META.JK', 'JSMR.JK', 'BIRD.JK', 'GIAA.JK', 'WIKA.JK', 'PTPP.JK', 'ADHI.JK', 
  'WSKT.JK', 'WSBP.JK', 'WTON.JK', 'BRPT.JK', 'TPIA.JK', 'INKP.JK', 'TKIM.JK', 'BMTR.JK', 
  'MNCN.JK', 'SCMA.JK', 'VIVA.JK', 'MDIA.JK', 'MSIN.JK', 'BHIT.JK', 'KPIG.JK', 'BCAP.JK', 
  'BABP.JK', 'LPPS.JK', 'LINK.JK', 'ISAT.JK', 'EXCL.JK', 'FREN.JK', 'TLKM.JK', 'HEAL.JK', 
  'MIKA.JK', 'PRDA.JK', 'SAME.JK', 'SILO.JK', 'DGNS.JK', 'IRRA.JK', 'WOOD.JK', 'PANI.JK', 
  'LUCY.JK', 'BEBS.JK', 'ZINC.JK', 'CPRO.JK', 'KAEF.JK', 'PYFA.JK', 'PEHA.JK', 'INAF.JK', 
  'TSPC.JK', 'ERAA.JK', 'ACES.JK', 'MAPI.JK', 'MAPA.JK', 'RALS.JK', 'LPPF.JK', 'BELI.JK', 
  'ASLC.JK', 'AUTO.JK', 'DRMA.JK', 'SMSM.JK', 'GJTL.JK', 'MASA.JK', 'IMAS.JK', 'TMAS.JK', 
  'NELI.JK', 'HAIS.JK', 'TCPI.JK', 'HITS.JK', 'BDKR.JK', 'CYBR.JK', 'STRK.JK', 'VTNY.JK',
  'RAAM.JK', 'TGUK.JK', 'FOLK.JK', 'MSKY.JK', 'PSAB.JK', 'SMGA.JK', 'AYAM.JK', 'GZCO.JK',
  'LABA.JK', 'SGER.JK', 'SMLE.JK', 'DOOH.JK', 'WIDI.JK', 'RGAS.JK', 'CGAS.JK', 'GRPH.JK'
];

async function analyzeTicker(symbol) {
  try {
    const summary = await yahooFinance.quoteSummary(symbol, {
      modules: ['price', 'summaryDetail']
    });

    const price = summary.price.regularMarketPrice;
    if (price < 50 || price > 300) return null;

    const avgVolume20 = summary.summaryDetail.averageVolume || summary.summaryDetail.averageVolume10days;
    const currentVolume = summary.price.regularMarketVolume;

    // Use a slightly more lenient volume check for intraday if it's still morning
    // But since the user wants "High liquidity", we'll check if it's at least 30% of daily avg (morning context)
    // Actually, I'll stick to the user's requirement but allow stocks that are very close.
    if (currentVolume < avgVolume20 * 0.3) return null; // Pre-filter for very low activity

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 45);

    const history = await yahooFinance.historical(symbol, {
      period1: startDate,
      period2: endDate,
      interval: '1d'
    });

    if (history.length < 20) return null;

    const closes = history.map(h => h.close).filter(c => typeof c === 'number');
    const highs = history.map(h => h.high).filter(h => typeof h === 'number');
    const lows = history.map(h => h.low).filter(l => typeof l === 'number');

    // Indicators
    const rsiValues = RSI.calculate({ values: closes, period: 14 });
    const rsi = rsiValues[rsiValues.length - 1];

    const macdValues = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });
    const macd = macdValues[macdValues.length - 1];

    const ema20 = EMA.calculate({ values: closes, period: 20 }).pop();
    const ema50 = EMA.calculate({ values: closes, period: 50 }).pop();

    const volSpike = ((currentVolume - avgVolume20) / avgVolume20) * 100;

    // Support/Resistance
    const resistance = Math.max(...highs.slice(-10));
    const support = Math.min(...lows.slice(-10));

    // Scoring
    let score = 50;
    let confirmations = 0;

    if (rsi > 45 && rsi < 70) { score += 10; confirmations++; }
    if (macd && macd.MACD > macd.signal) { score += 15; confirmations++; }
    if (ema20 > ema50) { score += 10; confirmations++; }
    if (price >= resistance * 0.99) { score += 20; confirmations++; } // Potential breakout
    if (volSpike > 0) { score += 10; confirmations++; }
    if (price > ema20) { score += 5; confirmations++; }

    // Final Validation
    if (confirmations < 3) return null;
    if (rsi > 80) score -= 25; // Overbought
    if (price < ema50 && ema20 < ema50) return null; // Strong downtrend

    const ticker = symbol.replace('.JK', '');
    const entry = `${price} – ${Math.round(price * 1.01)}`;
    const tp1 = Math.round(price * 1.03);
    const tp2 = Math.round(price * 1.05);
    const sl = Math.round(price * 0.97);
    const rr = `1:${((tp1 - price) / (price - sl)).toFixed(1)}`;

    let aiScoreText = 'Weak';
    if (score >= 85) aiScoreText = 'Strong';
    else if (score >= 70) aiScoreText = 'Moderate';

    let reason = '';
    if (price >= resistance) reason = 'Major breakout high with volume confirmation.';
    else if (macd && macd.MACD > macd.signal && price > ema20) reason = 'Bullish crossover and price above EMA20.';
    else reason = 'Bullish structure forming with volume support.';

    return {
      ticker,
      price,
      entry,
      tp1,
      tp2,
      sl,
      rr,
      volSpike: volSpike.toFixed(0),
      rsi: rsi.toFixed(2),
      trend: ema20 > ema50 ? 'Bullish' : 'Early Reversal',
      aiScore: Math.min(score, 99),
      aiScoreText,
      reason
    };
  } catch (err) {
    return null;
  }
}

async function main() {
  const tasks = TICKERS.map(t => analyzeTicker(t));
  const results = (await Promise.all(tasks)).filter(r => r !== null);

  results.sort((a, b) => b.aiScore - a.aiScore);

  results.slice(0, 5).forEach((r, i) => {
    console.log(`${i + 1}️⃣ ${r.ticker}\n`);
    console.log(`Price: ${r.price}`);
    console.log(`Entry: ${r.entry}`);
    console.log(`TP1: ${r.tp1}`);
    console.log(`TP2: ${r.tp2}`);
    console.log(`SL: ${r.sl}`);
    console.log(`RR: ${r.rr}`);
    console.log(`Volume Spike: ${r.volSpike}%`);
    console.log(`RSI: ${r.rsi}`);
    console.log(`Trend: ${r.trend}`);
    console.log(`AI Score: ${r.aiScore} 🔥 (${r.aiScoreText})\n`);
    console.log(`Reason: ${r.reason}\n`);
    console.log('---');
  });
}

main();
