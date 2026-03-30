import puppeteer, { Browser, Page } from 'puppeteer';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

interface SiteConfig {
  name: string;
  baseUrl: string;
  campaignUrl: string;
  currentSelectors: string;
}

const SITES: SiteConfig[] = [
  {
    name: '4nala',
    baseUrl: 'https://www.4nala.com',
    campaignUrl: 'https://www.4nala.com/bonus',
    currentSelectors: '.campaign-item, .bonus-card, .promotion-card, [class*="campaign"]',
  },
  {
    name: 'altiliganyan',
    baseUrl: 'https://www.altiliganyan.com',
    campaignUrl: 'https://www.altiliganyan.com/bonus',
    currentSelectors: '.campaign-box, .bonus-container, .promotion, [class*="bonus"], [class*="kampanya"]',
  },
  {
    name: 'atyarisi',
    baseUrl: 'https://www.atyarisi.com',
    campaignUrl: 'https://www.atyarisi.com/bonus',
    currentSelectors: '.bonus-item, .promotion-box, .campaign-card, [class*="bonus"], [class*="promosyon"]',
  },
  {
    name: 'bilyoner',
    baseUrl: 'https://www.bilyoner.com',
    campaignUrl: 'https://www.bilyoner.com/bonus',
    currentSelectors: '.campaign-item, .bonus-card, .promotion-item, [class*="kampanya"]',
  },
  {
    name: 'birebin',
    baseUrl: 'https://www.birebin.com',
    campaignUrl: 'https://www.birebin.com/teklifler',
    currentSelectors: '.offer-item, .deal-box, .campaign-offer, [class*="teklif"]',
  },
  {
    name: 'ekuri',
    baseUrl: 'https://www.ekuri.com',
    campaignUrl: 'https://www.ekuri.com/bonus',
    currentSelectors: '.ekuri-campaign, .bonus-offer, .promotion-card, [class*="kampanya"]',
  },
  {
    name: 'hipodrom',
    baseUrl: 'https://www.hipodrom.com',
    campaignUrl: 'https://www.hipodrom.com/bonus',
    currentSelectors: '.hipo-campaign, .bonus-card, .promotion, [class*="bonus"]',
  },
  {
    name: 'misli',
    baseUrl: 'https://www.misli.com',
    campaignUrl: 'https://www.misli.com/bonus',
    currentSelectors: '.misli-campaign, .bonus-box, .promo-offer, [class*="bonus"]',
  },
  {
    name: 'nesine',
    baseUrl: 'https://www.nesine.com',
    campaignUrl: 'https://www.nesine.com/bonus',
    currentSelectors: '.ns-campaign, .bonus-offer, .promotion-item, [class*="ns-"]',
  },
  {
    name: 'oley',
    baseUrl: 'https://www.oley.com',
    campaignUrl: 'https://www.oley.com/bonus',
    currentSelectors: '.oley-campaign, .bonus-item, .promo-card, [class*="bonus"]',
  },
  {
    name: 'sondzulyuk',
    baseUrl: 'https://www.sondzulyuk.com',
    campaignUrl: 'https://www.sondzulyuk.com/bonus',
    currentSelectors: '.dz-campaign, .bonus-offer, .special-deal, [class*="dz-"]',
  },
];

const COMMON_SELECTORS = [
  '[class*="campaign"]',
  '[class*="bonus"]',
  '[class*="promo"]',
  '[class*="offer"]',
  '[class*="deal"]',
  '.campaign',
  '.bonus',
  '.promotion',
  '.offer',
  '.deal',
  '.card',
  '.item',
  '[class*="kampanya"]',
  '[class*="teklif"]',
  '.container',
  'main',
  '[role="main"]',
  'section',
];

interface TestResult {
  site: string;
  urlWorks: boolean;
  loginRequired: boolean;
  selectorsFound: string[];
  campaignsExtracted: number;
  error?: string;
  htmlDump?: string;
  screenshotPath?: string;
  pageTitle?: string;
  bodyText?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForDynamicContent(page: Page, timeout: number = 10000): Promise<void> {
  await sleep(2000);

  try {
    await page.waitForFunction(() => {
      return document.body !== null && document.body.innerText.length > 100;
    }, { timeout: 8000 });
  } catch {
  }

  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await sleep(500);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function testSite(browser: Browser, site: SiteConfig): Promise<TestResult> {
  const result: TestResult = {
    site: site.name,
    urlWorks: false,
    loginRequired: false,
    selectorsFound: [],
    campaignsExtracted: 0,
  };

  let page: Page | null = null;

  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    console.log(`\n========================================`);
    console.log(`Testing: ${site.name}`);
    console.log(`URL: ${site.campaignUrl}`);
    console.log(`========================================`);

    await page.goto(site.campaignUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await waitForDynamicContent(page, 15000);

    result.urlWorks = true;
    result.pageTitle = await page.title();
    console.log(`  Page title: ${result.pageTitle}`);

    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
    result.bodyText = bodyText.slice(0, 200);

    const loginIndicators = await page.evaluate(() => {
      const body = document.body.innerText.toLowerCase();
      return body.includes('giriş') || body.includes('login') || body.includes('üye') || 
             body.includes('sign in') || body.includes('şifre') || body.includes('password');
    });

    const pageContent = await page.content();
    const hasLoginForm = pageContent.includes('type="password"') || 
                         pageContent.includes('type="email"') ||
                         pageContent.includes('name="email"') ||
                         pageContent.includes('name="password"') ||
                         pageContent.includes(' 로그인') ||
                         pageContent.includes('登入');

    const hasLoginModal = bodyText.includes('Giriş yap') || 
                          bodyText.includes('Üye ol') ||
                          bodyText.includes('Login') ||
                          pageContent.includes('modal') && loginIndicators;

    result.loginRequired = loginIndicators && (hasLoginForm || hasLoginModal);

    if (result.loginRequired) {
      console.log(`  [!] Login required (detected login form/modal)`);
      result.error = 'Login required';
      const screenshotPath = `test-output/${site.name}-login.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      result.screenshotPath = screenshotPath;
      return result;
    }

    const screenshotPath = `test-output/${site.name}-campaigns.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    result.screenshotPath = screenshotPath;
    console.log(`  [+] Screenshot saved: ${screenshotPath}`);

    const htmlDumpPath = `test-output/${site.name}-dump.html`;
    const htmlContent = await page.content();
    writeFileSync(htmlDumpPath, htmlContent);
    result.htmlDump = htmlDumpPath;
    console.log(`  [+] HTML dump saved: ${htmlDumpPath}`);

    const foundSelectors: string[] = [];

    console.log(`\n  Testing common selectors:`);
    for (const selector of COMMON_SELECTORS) {
      try {
        const elements = await page.$$(selector);
        if (elements.length > 0) {
          foundSelectors.push(`${selector} (${elements.length} found)`);
          console.log(`  [+] ${selector} -> ${elements.length} elements`);
        }
      } catch {
      }
    }

    const currentSelectorParts = site.currentSelectors.split(',').map(s => s.trim());

    console.log(`\n  Testing current selectors from adapter:`);
    for (const selector of currentSelectorParts) {
      try {
        const elements = await page.$$(selector);
        if (elements.length > 0) {
          if (!result.selectorsFound.includes(`${selector} (${elements.length} found)`)) {
            result.selectorsFound.push(`${selector} (${elements.length} found)`);
          }
          console.log(`  [+] ${selector} -> ${elements.length} elements`);
        } else {
          console.log(`  [-] ${selector} -> 0 elements`);
        }
      } catch (e) {
        console.log(`  [-] ${selector} -> error`);
      }
    }

    const pageStructure = await page.evaluate(() => {
      const seen = new Map<string, number>();
      const allElements = Array.from(document.querySelectorAll('*'));
      
      for (const el of allElements) {
        const tag = el.tagName.toLowerCase();
        const className = el.className || '';
        const key = `${tag}.${className}`;
        
        if (seen.has(key)) {
          seen.set(key, seen.get(key)! + 1);
        } else {
          seen.set(key, 1);
        }
      }

      const sorted = Array.from(seen.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100);

      return sorted
        .filter(([key]) => {
          const [tag, cls] = key.split('.');
          return (cls.includes('campaign') || cls.includes('bonus') ||
                  cls.includes('promo') || cls.includes('offer') || 
                  cls.includes('deal') || cls.includes('kampanya') || 
                  cls.includes('teklif') || cls.includes('item') ||
                  cls.includes('card') || tag === 'section') && seen.get(key)! >= 1;
        })
        .slice(0, 30)
        .map(([key, count]) => {
          const [tag, ...clsParts] = key.split('.');
          return { tag, class: clsParts.join('.'), count };
        });
    });

    console.log(`\n  Page structure (campaign-related classes):`);
    for (const item of pageStructure) {
      console.log(`    ${item.tag}.${item.class} (${item.count})`);
    }

    const allFoundSelectors = [...foundSelectors, ...result.selectorsFound];
    if (allFoundSelectors.length > 0) {
      const firstWorkingSelector = allFoundSelectors[0].split(' ')[0];
      try {
        const cards = await page.$$(firstWorkingSelector);
        result.campaignsExtracted = cards.length;
        console.log(`\n  [+] Campaigns extracted with "${firstWorkingSelector}": ${cards.length}`);
      } catch {
        result.campaignsExtracted = 0;
      }
    }

  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    console.log(`  [!] Error: ${result.error}`);
  } finally {
    if (page) {
      await page.close();
    }
  }

  return result;
}

async function main() {
  console.log('========================================');
  console.log('Betting Site Adapters - Selector Test');
  console.log('========================================\n');

  const outputDir = 'test-output';
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  const results: TestResult[] = [];

  for (const site of SITES) {
    const result = await testSite(browser, site);
    results.push(result);
  }

  await browser.close();

  console.log('\n\n========================================');
  console.log('SUMMARY');
  console.log('========================================\n');

  for (const result of results) {
    console.log(`${result.site}:`);
    console.log(`  URL Works: ${result.urlWorks ? 'YES' : 'NO'}`);
    console.log(`  Login Required: ${result.loginRequired ? 'YES' : 'NO'}`);
    console.log(`  Selectors Found: ${result.selectorsFound.length > 0 ? result.selectorsFound.join(', ') : 'NONE'}`);
    console.log(`  Campaigns Extracted: ${result.campaignsExtracted}`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
    if (result.screenshotPath) {
      console.log(`  Screenshot: ${result.screenshotPath}`);
    }
    if (result.pageTitle) {
      console.log(`  Page Title: ${result.pageTitle}`);
    }
    console.log('');
  }

  const successCount = results.filter(r => r.urlWorks && !r.loginRequired && r.campaignsExtracted > 0).length;
  console.log(`\nSuccessful (campaigns extracted): ${successCount}/${results.length} sites`);

  const loginRequiredCount = results.filter(r => r.loginRequired).length;
  console.log(`Login Required: ${loginRequiredCount}/${results.length} sites`);

  const outputPath = 'test-output/results.json';
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);
}

main().catch(console.error);
