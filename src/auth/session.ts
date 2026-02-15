import { chromium, type BrowserContext, type Page } from 'playwright';
import { CONFIG } from '../config';
import { fileExists } from '../utils/fs';
import { loginAndSaveState } from './login';

async function isLoggedIn(page: Page): Promise<boolean> {
  await page.goto(CONFIG.checkUrl, { waitUntil: 'domcontentloaded' });
  const url = page.url();
  return !url.includes('/account/login');
}

export async function getAuthedContext(): Promise<BrowserContext> {
  // If we don't have storageState yet, force login.
  if (!fileExists(CONFIG.storageStatePath)) {
    await loginAndSaveState();
  }

  const browser = await chromium.launch({
    headless: false, // keep this false for reliability at first; change later if stable
  });

  let context = await browser.newContext({
    storageState: CONFIG.storageStatePath,
  });

  const page = await context.newPage();
  const ok = await isLoggedIn(page);

  if (!ok) {
    // Session expired -> re-login and recreate context
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    await loginAndSaveState();

    const browser2 = await chromium.launch({ headless: false });
    context = await browser2.newContext({ storageState: CONFIG.storageStatePath });

    const page2 = await context.newPage();
    const ok2 = await isLoggedIn(page2);
    if (!ok2) {
      await context.close().catch(() => {});
      await browser2.close().catch(() => {});
      throw new Error('Could not restore authenticated session even after re-login.');
    }
  }

  return context;
}
