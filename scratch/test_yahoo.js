const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

async function test() {
  try {
    const symbol = '^JKSE';
    const result = await yahooFinance.quote(symbol);
    console.log('IHSG Quote:', JSON.stringify(result, null, 2));

    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 6);
    const history = await yahooFinance.historical(symbol, {
      period1: startDate,
      period2: endDate,
      interval: '1d'
    });
    console.log('IHSG History count:', history.length);
  } catch (err) {
    console.error('Error fetching IHSG:', err);
  }
}

test();
