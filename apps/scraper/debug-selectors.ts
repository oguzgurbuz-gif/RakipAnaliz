import puppeteer from 'puppeteer';

const tests = [
  { url: 'https://www.altiliganyan.com/kampanyalar', selector: '.campaign-list__item' },
  { url: 'https://www.hipodrom.com/kampanyalar', selector: '.campaignItem' },
];

async function runTest(url: string, selector: string) {
  console.log(`\n=== Testing ${url} ===`);
  console.log(`Looking for selector: ${selector}`);
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    // Test with networkidle0
    console.log('\n--- Test 1: waitUntil: networkidle0 ---');
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector(selector, { timeout: 10000 });
    console.log('SELECTOR FOUND with networkidle0!');
    
    const count = await page.$$eval(selector, els => els.length);
    console.log(`Found ${count} elements`);
    
  } catch (e) {
    console.log('FAILED with networkidle0:', e instanceof Error ? e.message : 'Unknown error');
    
    // If failed, dump some HTML to understand the structure
    try {
      const bodyHtml = await page.$eval('body', el => el.innerHTML.substring(0, 5000));
      console.log('\n--- Page HTML (first 5000 chars) ---');
      console.log(bodyHtml);
    } catch {}
  }

  await browser.close();
}

async function main() {
  for (const test of tests) {
    await runTest(test.url, test.selector);
  }
}

main().catch(console.error);