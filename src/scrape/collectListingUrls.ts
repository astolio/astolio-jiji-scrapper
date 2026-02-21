import type { Page } from 'playwright';

function toAbsoluteUrl(href: string): string {
  if (href.startsWith('http')) return href;
  // Jiji uses relative links like /nairobi-central/...html?page=1...
  return `https://jiji.co.ke${href}`;
}

async function extractListingUrls(page: Page): Promise<string[]> {
  // From your HTML: anchors have `.qa-advert-list-item` and href contains the listing
  const hrefs = await page.$$eval('a.qa-advert-list-item[href]', (as) =>
    as
      .map((a) => (a as HTMLAnchorElement).getAttribute('href') || '')
      .filter(Boolean)
  );

  // Normalize + dedupe
  const urls = new Set<string>();
  for (const h of hrefs) {
    // strip hash, keep query (pos/page is fine)
    const abs = toAbsoluteUrl(h.split('#')[0]);
    urls.add(abs);
  }

  return [...urls];
}

export async function collectListingUrls(params: {
  page: Page;
  categoryUrl: string;
  maxNoGrowthRounds?: number; // how many "no new items" loops before stopping
  scrollDelayMsRange?: [number, number]; // human-ish
}): Promise<string[]> {
  const {
    page,
    categoryUrl,
    maxNoGrowthRounds = 3,
    scrollDelayMsRange = [5000, 10000],
  } = params;

  await page.goto(categoryUrl, { waitUntil: 'domcontentloaded' });

  // Wait for listing container to exist
  await page.locator('.qa-advert-listing, .b-advert-listing').first().waitFor({ timeout: 30_000 });

  const all = new Set<string>();
  let noGrowth = 0;
  let prevCount = 0;

  while (noGrowth < maxNoGrowthRounds) {
    // Extract currently loaded links
    const urls = await extractListingUrls(page);
    urls.forEach((u) => all.add(u));

    const currentCount = all.size;

    if (currentCount === prevCount) {
      noGrowth++;
    } else {
      noGrowth = 0;
      prevCount = currentCount;
    }

    // Scroll down to trigger more items
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    // Wait for network/DOM to settle a bit
    const [min, max] = scrollDelayMsRange;
    const wait = Math.floor(min + Math.random() * (max - min));
    await page.waitForTimeout(wait);

    // Small extra: wait for any new masonry items to appear (best-effort)
    await page.waitForTimeout(250);
  }

  return [...all];
}
