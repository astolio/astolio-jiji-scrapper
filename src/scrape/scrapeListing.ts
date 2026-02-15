import type { Page } from 'playwright';
import type { Lead, QueueItem } from '../types';
import { normalizePhone } from '../data/normalizePhone';

function randomBetween(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min));
}

async function humanPause(page: Page, minMs: number, maxMs: number) {
  await page.waitForTimeout(randomBetween(minMs, maxMs));
}

export async function scrapeListing(page: Page, item: QueueItem): Promise<Lead> {
  await page.goto(item.url, { waitUntil: 'domcontentloaded' });

  // Listing title (your DOM: h1.qa-advert-title > div.b-advert-title-inner)
  const titleEl = page.locator('h1.qa-advert-title, h1.b-advert-title').first();
  await titleEl.waitFor({ state: 'visible', timeout: 30_000 });

  const listingTitle = (await page
    .locator('h1.qa-advert-title .b-advert-title-inner, h1.b-advert-title .b-advert-title-inner, h1.qa-advert-title, h1.b-advert-title')
    .first()
    .textContent())?.replace(/\s+/g, ' ').trim() || 'Unknown';


  // Wait for seller block to be present
  const sellerBlock = page.locator('.b-advert-seller-block').first();
  await sellerBlock.waitFor({ state: 'visible', timeout: 30_000 });

  // Human pause before interacting
  await humanPause(page, 1200, 2800);

  // Seller name
  const nameEl = page.locator('.b-seller-block__name').first();
  const sellerName = (await nameEl.textContent())?.replace(/\s+/g, ' ').trim() || 'Unknown';

  // "Show contact" button/link
  const showContact = page.locator('a.qa-show-contact, a.js-show-contact, a.b-show-contact').first();
  await showContact.waitFor({ state: 'visible', timeout: 20_000 });

  // Scroll into view (helps with sticky UI)
  await showContact.scrollIntoViewIfNeeded();
  await humanPause(page, 600, 1400);

  // Click to reveal contact
  // After click, the same anchor becomes href="tel:...." and shows phone text
  await showContact.click({ timeout: 10_000 }).catch(async () => {
    // fallback if something intercepts clicks
    await showContact.click({ force: true, timeout: 10_000 });
  });

  // IMPORTANT: wait before extracting (your requirement)
  await humanPause(page, 1300, 2600);

  // Wait until tel appears OR phone text appears
  await page.waitForFunction(() => {
    const a = document.querySelector('a.qa-show-contact') as HTMLAnchorElement | null;
    const tel = a?.getAttribute('href') || '';
    const phoneSpan = document.querySelector('.qa-show-contact-phone')?.textContent || '';
    return tel.startsWith('tel:') || phoneSpan.trim().length >= 9;
  }, { timeout: 20_000 });

  // Extract phone (prefer tel: href)
  const phoneRaw = await page.evaluate(() => {
    const a = document.querySelector('a.qa-show-contact') as HTMLAnchorElement | null;
    const href = a?.getAttribute('href') || '';
    if (href.startsWith('tel:')) return href.replace('tel:', '').trim();

    const txt = document.querySelector('.qa-show-contact-phone')?.textContent || '';
    return txt.trim();
  });

  if (!phoneRaw) {
    throw new Error('Phone not found after clicking Show contact.');
  }

  const lead: Lead = {
    sellerName,
    phoneRaw,
    phoneNormalized: normalizePhone(phoneRaw),
    listingTitle,
    listingUrl: item.url,
    category: item.category,
    categoryUrl: item.categoryUrl,
    scrapedAt: new Date().toISOString(),
  };

  return lead;
}
