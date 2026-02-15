import type { BrowserContext } from 'playwright';
import { getNextQueued, incrementAttempts, markStatus } from '../data/queueStore';
import { upsertLead } from '../data/leadsStore';
import { scrapeListing } from './scrapeListing';

function randomBetween(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min));
}

export async function runQueue(
  ctx: BrowserContext,
  opts?: { maxItems?: number }
) {
  const page = await ctx.newPage();
  let processed = 0;

  while (true) {
    const item = getNextQueued();
    if (!item) {
      console.log('✅ No queued items left.');
      break;
    }

    if (opts?.maxItems && processed >= opts.maxItems) {
      console.log(`✅ Reached maxItems=${opts.maxItems}. Stopping.`);
      break;
    }

    console.log(`\n➡️  Scraping: ${item.url}`);
    console.log(`   Category: ${item.category}`);

    markStatus(item.url, 'processing');
    incrementAttempts(item.url);

    try {
      const lead = await scrapeListing(page, item);

      // 🔒 DEDUPE + SAVE
      const result = upsertLead(lead);

      if (!result.inserted) {
        // Even if duplicate, we don’t want to retry forever
        markStatus(item.url, 'done');
        processed++;

        console.log(
          `⚠️ Duplicate skipped (${result.reason}). ${lead.phoneNormalized}`
        );
      } else {
        markStatus(item.url, 'done');
        processed++;

        console.log(
          `✅ Lead: ${lead.sellerName} — ${lead.phoneRaw} (${lead.phoneNormalized})`
        );
        console.log(`   Title: ${lead.listingTitle}`);
      }

      // Cooldown between listings
      await page.waitForTimeout(randomBetween(1500, 3500));

      // Occasionally longer break (keeps it human-ish)
      if (processed % 20 === 0) {
        await page.waitForTimeout(randomBetween(6000, 12000));
      }

    } catch (err: any) {

      const msg = String(err?.message ?? err);

      if (msg.includes('No show-contact trigger found')) {
        markStatus(item.url, 'skipped');
        console.log(`⚠️ Skipped: ${item.url}`);
        console.log(`   Reason: ${msg}`);
      } else {
        markStatus(item.url, 'failed');
        console.log(`❌ Failed: ${item.url}`);
        console.log(`   Reason: ${msg}`);
      }

      await page.waitForTimeout(randomBetween(2000, 5000));
      await page.waitForTimeout(randomBetween(2000, 5000));
    }
  }

  await page.close();
}
