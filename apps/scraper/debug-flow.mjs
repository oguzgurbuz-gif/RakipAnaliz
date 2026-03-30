import puppeteer from 'puppeteer';

async function runScraperFlow(url, selector) {
  console.log('\n=== Simulating scraper flow for ' + url + ' ===');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    console.log('Step 1: page.goto with domcontentloaded');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('  Page loaded');
    
    console.log('Step 2: Waiting 2 seconds...');
    await new Promise(r => setTimeout(r, 2000));
    console.log('  Done waiting');
    
    console.log('Step 3: waitForSelector with 15s timeout');
    try {
      await page.waitForSelector(selector, { timeout: 15000 });
      console.log('  Selector found!');
    } catch (e) {
      console.log('  waitForSelector failed:', e.message);
    }
    
    console.log('Step 4: Finding cards');
    const cards = await page.$$(selector);
    console.log('  Found ' + cards.length + ' cards');
    
  } catch (e) {
    console.log('Error:', e.message);
  }

  await browser.close();
}

await runScraperFlow('https://www.altiliganyan.com/kampanyalar', '.campaign-list__item');
await runScraperFlow('https://www.hipodrom.com/kampanyalar', '.campaignItem');