import { chromium, type Page } from 'playwright';
import { CONFIG } from '../config';
import { ensureDir } from '../utils/fs';

async function isLoggedIn(page: Page): Promise<boolean> {
  // If account page doesn't redirect to auth/login modal route, it's a good sign.
  await page.goto(CONFIG.checkUrl, { waitUntil: 'domcontentloaded' });

  const url = page.url();
  if (url.includes('auth=Login') || url.includes('/account/login')) return false;

  // If "Sign in" is visible in header, likely logged out.
  const signInVisible = (await page.locator('a[href*="auth=Login"]').count().catch(() => 0)) > 0;
  return !signInVisible;
}

export async function loginAndSaveState(): Promise<void> {
  ensureDir(CONFIG.storageDir);

  const browser = await chromium.launch({
    headless: false, // keep headful for reliability
    slowMo: 50,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(CONFIG.homeUrl, { waitUntil: 'domcontentloaded' });

  // Click "Sign in" (your HTML shows: <a href="/?auth=Login">Sign in</a>)
  // 1) If an overlay exists (cookie modal / background blocker), dismiss it
const overlay = page.locator('.fw-fixed-background').first();
if (await overlay.count()) {
  // Sometimes it disappears by itself; sometimes you need to click ESC or close button.
  // Try ESC first (least invasive).
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);

  // If still present, try clicking any visible close "X" icons
  const closeBtn = page.locator(
    'button[aria-label*="close" i], .b-auth-popup__close, .fw-popup__close, svg use[href*="cross"], svg use[xlink\\:href*="cross"]'
  ).first();

  if (await closeBtn.count()) {
    await closeBtn.click({ timeout: 2000 }).catch(() => {});
  }

  // Wait a moment for overlay to go away (don’t hard fail if it remains yet)
  await page.waitForTimeout(800);
}

// 2) Click "Sign in" safely
const signInLink = page.locator('a[href*="auth=Login"]').first();
await signInLink.waitFor({ state: 'visible', timeout: 30_000 });

// Try normal click
try {
  await signInLink.click({ timeout: 5000 });
} catch {
  // Fallback A: force click (bypasses some pointer interception)
  try {
    await signInLink.click({ force: true, timeout: 5000 });
  } catch {
    // Fallback B: click via JS (last resort)
    await page.evaluate(() => {
      const a = document.querySelector('a[href*="auth=Login"]') as HTMLElement | null;
      a?.click();
    });
  }
}


  // Wait for the popup container
  const popup = page.locator('.b-auth-popup, .fw-popup__container.b-auth-popup').first();
  await popup.waitFor({ state: 'visible', timeout: 30_000 });

  // Click "E-mail or phone" button (in popup)
  const emailOrPhoneBtn = popup.locator('button:has-text("E-mail or phone"), button:has-text("E-mail"), button:has-text("E-mail or phone")').first();
  await emailOrPhoneBtn.waitFor({ state: 'visible', timeout: 30_000 });
  await emailOrPhoneBtn.click();

  // Now the form view appears with inputs id="emailOrPhone" and id="password"
  const emailInput = page.locator('#emailOrPhone').first();
  const passwordInput = page.locator('#password').first();

  await emailInput.waitFor({ state: 'visible', timeout: 30_000 });
  await passwordInput.waitFor({ state: 'visible', timeout: 30_000 });

  await emailInput.fill(CONFIG.emailOrPhone);
  await passwordInput.fill(CONFIG.password);

  // Submit button: button.qa-login-submit (starts disabled, becomes enabled after inputs)
  const submitBtn = page.locator('button.qa-login-submit').first();

  // Wait until enabled
  await submitBtn.waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(() => {
    const btn = document.querySelector('button.qa-login-submit') as HTMLButtonElement | null;
    return !!btn && !btn.disabled;
  });

  await submitBtn.click();

  // Give it time to settle. If OTP/captcha appears, you can handle it manually in the open browser.
  await page.waitForTimeout(4000);

  const ok = await isLoggedIn(page);
  if (!ok) {
    await page.screenshot({ path: `${CONFIG.storageDir}/login_failed.png`, fullPage: true });
    await browser.close();
    throw new Error(
      'Login did not complete. You may need to solve OTP/challenge manually, or selectors changed. Check storage/login_failed.png'
    );
  }

  await context.storageState({ path: CONFIG.storageStatePath });
  await browser.close();
}
