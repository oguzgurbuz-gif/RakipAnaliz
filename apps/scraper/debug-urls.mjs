import puppeteer from 'puppeteer';

async function test(url, name) {
  console.log('\n=== Testing ' + name + ': ' + url + ' ===');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    
    const selectors = {
      altiliganyan: '.campaign-list__item',
      hipodrom: '.campaignItem'
    };
    
    const selector = selectors[name];
    if (!selector) {
      console.log('Unknown site:', name);
      return;
    }
    
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      const count = await page.$$eval(selector, els => els.length);
      console.log('SELECTOR FOUND: ' + count + ' elements');
    } catch (e) {
      console.log('SELECTOR NOT FOUND:', e.message);
      const body = await page.$eval('body', el => el.innerHTML.substring(0, 2000));
      console.log('\nHTML snippet:\n', body);
    }
  } catch (e) {
    console.log('Error:', e.message);
  }

  await browser.close();
}

// Test the URL from scraper logs (no www, no path)
await test('https://altiliganyan.com', 'altiliganyan');
await test('https://hipodrom.com', 'hipodrom');

// Test with www but no kampanyalar path
await test('https://www.altiliganyan.com', 'altiliganyan');
await test('https://www.hipodrom.com', 'hipodrom');

// Test the campaignUrl from test-adapters.ts
await test('https://www.altiliganyan.com/bonus', 'altiliganyan');
await test('https://www.hipodrom.com/bonus', 'hipodrom');

// Test the campaignsUrl from adapters
await test('https://www.altiliganyan.com/kampanyalar', 'altiliganyan');
await test('https://www.hipodrom.com/kampanyalar', 'hipodrom');