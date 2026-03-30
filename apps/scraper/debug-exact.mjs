import puppeteer from 'puppeteer';

async function runExactScraperFlow(url, selector) {
  console.log('\n=== Exact scraper flow for ' + url + ' ===');
  
  // EXACT same launch args as scraper.ts:124-133
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  const page = await browser.newPage();
  
  // EXACT same user agent as scraper.ts:139
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    // EXACT same goto as scraper.ts:157-160
    console.log('Step 1: page.goto with domcontentloaded, timeout 30000');
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    console.log('  Page loaded');
    
    // EXACT same wait as scraper.ts:171
    console.log('Step 2: Waiting 2000ms...');
    await new Promise(r => setTimeout(r, 2000));
    console.log('  Done');
    
    // EXACT same waitForSelector as adapter
    console.log('Step 3: waitForSelector with 15000ms timeout');
    try {
      await page.waitForSelector(selector, { timeout: 15000 });
      console.log('  Selector found!');
    } catch (e) {
      console.log('  waitForSelector failed:', e.message);
      throw e; // Re-throw to match scraper behavior
    }
    
    console.log('Step 4: Finding cards');
    const cards = await page.$$(selector);
    console.log('  Found ' + cards.length + ' cards');
    
  } catch (e) {
    console.log('Error:', e.message);
    throw e;
  } finally {
    await browser.close();
  }
}

console.log('PUPPETEER_EXECUTABLE_PATH:', process.env.PUPPETEER_EXECUTABLE_PATH);

await runExactScraperFlow('https://www.altiliganyan.com/kampanyalar', '.campaign-list__item');
await runExactScraperFlow('https://www.hipodrom.com/kampanyalar', '.campaignItem');

console.log('\nAll tests passed!');