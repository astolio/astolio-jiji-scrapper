import type { BrowserContext } from "playwright";
import { getNextQueued, incrementAttempts, markStatus } from "../data/queueStore";
import { upsertLead } from "../data/leadsStore";
import { scrapeListing } from "./scrapeListing";
import { pushLeadToConvex } from "../convexPush";
import { createStats, bump, renderSummary } from "../obs/stats";

function randomBetween(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min));
}

function normalizeErr(err: any) {
  const msg = (err?.message ?? String(err)).trim();
  // Keep it short so errors bucket nicely
  return msg.split("\n")[0].slice(0, 140);
}

export async function runQueue(ctx: BrowserContext, opts?: { maxItems?: number }) {
  const page = await ctx.newPage();
  const stats = createStats();

  let processed = 0;

  try {
    while (true) {
      const item = getNextQueued();
      if (!item) {
        console.log("✅ No queued items left.");
        break;
      }

      if (opts?.maxItems && processed >= opts.maxItems) {
        console.log(`✅ Reached maxItems=${opts.maxItems}. Stopping.`);
        break;
      }

      console.log(`\n➡️  Scraping: ${item.url}`);
      console.log(`   Category: ${item.category}`);

      markStatus(item.url, "processing");
      incrementAttempts(item.url);

      stats.processed++;
      bump(stats.byCategory, item.category || "Uncategorized");

      // ---- scrape timing
      const tScrape0 = Date.now();

      try {
        const lead = await scrapeListing(page, item);
        stats.scrapedOk++;
        stats.scrapeMsTotal += Date.now() - tScrape0;

        // Optional local backup (recommended)
        upsertLead(lead);

        // ---- push timing
        const tPush0 = Date.now();
        try {
          const payload = {
            source: "jiji" as const,
            name: lead.sellerName,
            phoneRaw: lead.phoneRaw,
            phoneNormalized: lead.phoneNormalized,
            category: lead.category,
            whatsapp: lead.phoneNormalized ? `https://wa.me/${lead.phoneNormalized}` : undefined,
            sourceMeta: {
              listingTitle: lead.listingTitle,
              listingUrl: lead.listingUrl,
              categoryUrl: lead.categoryUrl,
              scrapedAt: new Date().toISOString(),
            },
          };

          const r = await pushLeadToConvex(payload);

          stats.pushMsTotal += Date.now() - tPush0;

          // If your convex returns {created, updated}, treat updated as dupe
          if (r?.result?.updated) stats.dupes++;
          stats.pushedOk++;

          console.log(`✅ Lead pushed: ${lead.sellerName} — ${lead.phoneNormalized}`);
          console.log(`   Title: ${lead.listingTitle}`);

          markStatus(item.url, "done");
          processed++;
        } catch (err: any) {
          stats.failedPush++;
          bump(stats.errors, `push: ${normalizeErr(err)}`);

          // Don’t mark the listing scrape as failed; just the upload
          console.log(`⚠️ Push failed (keeping local backup): ${normalizeErr(err)}`);
          markStatus(item.url, "done");
          processed++;
        }

        // Cooldown between listings
        if (!page.isClosed()) {
          await page.waitForTimeout(randomBetween(1500, 3500));
          if (processed % 20 === 0) await page.waitForTimeout(randomBetween(6000, 12000));
        }

        // Heartbeat every 10 items
        if (processed % 10 === 0) {
          console.log(renderSummary(stats));
        }
      } catch (err: any) {
        stats.failedScrape++;
        bump(stats.errors, `scrape: ${normalizeErr(err)}`);

        markStatus(item.url, "failed");
        console.log(`❌ Failed: ${item.url}`);
        console.log(`   Reason: ${normalizeErr(err)}`);

        if (!page.isClosed()) {
          await page.waitForTimeout(randomBetween(2000, 5000));
        }
      }
    }
  } finally {
    console.log("\n" + renderSummary(stats));
    if (!page.isClosed()) await page.close();
  }
}
