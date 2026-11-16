const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

async function testSymbols() {
  const symbols = [
    '^JKSE', '^JKFINA', '^JKTECH', '^JKENER', '^JKBASIC', 
    '^JKINFRA', '^JKNONCYC', '^JKCYC', '^JKPROP', '^JKTRAN', 
    '^JKHLTH', '^JKINDUS'
  ];

  for (const symbol of symbols) {
    try {
      const quote = await yahooFinance.quote(symbol);
      console.log(`✅ ${symbol}: ${quote.regularMarketPrice} (${quote.shortName})`);
    } catch (e) {
      console.log(`❌ ${symbol}: Not found`);
    }
  }
}

testSymbols();
