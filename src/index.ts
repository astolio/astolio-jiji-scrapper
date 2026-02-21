import { loginAndSaveState } from './auth/login';
import { getAuthedContext } from './auth/session';
import { CONFIG } from './config';
import { collectListingUrls } from './scrape/collectListingUrls';
import { enqueueUrls } from './data/queueStore';
import { CATEGORIES } from './categories';
import { runQueue } from './scrape/runQueue';
import { recordCategoryRun } from './data/categoryStore';
import { telemetry } from "./telemetry/telemetry";



async function main() {
  const cmd = process.argv[2];

  await telemetry.log({
    title: "Process started",
    level: "INFO",
    details: { cmd, pid: process.pid, node: process.version },
    tags: ["boot"],
  });

  if (cmd === "login") {
    try {
      await telemetry.log({ title: "Login started", level: "INFO", tags: ["auth"] });
      await loginAndSaveState();
      await telemetry.log({
        title: "Login ok",
        level: "SUCCESS",
        details: { storageStatePath: CONFIG.storageStatePath },
        tags: ["auth"],
      });
      console.log(`✅ Logged in. Saved storage state to: ${CONFIG.storageStatePath}`);
      return;
    } catch (err) {
      await telemetry.error({ title: "Login failed", err, tags: ["auth"] });
      throw err;
    }
  }

  if (cmd === "check") {
    const ctx = await getAuthedContext();
    try {
      await telemetry.log({ title: "Session check started", level: "INFO", tags: ["auth"] });
      const page = await ctx.newPage();
      await page.goto(CONFIG.checkUrl, { waitUntil: "domcontentloaded" });
      await telemetry.log({
        title: "Session looks valid",
        level: "SUCCESS",
        details: { url: page.url() },
        tags: ["auth"],
      });
      console.log(`✅ Session looks valid. Current URL: ${page.url()}`);
      await ctx.close();
      return;
    } catch (err) {
      await telemetry.error({
        title: "Session check failed",
        err,
        details: { checkUrl: CONFIG.checkUrl },
        tags: ["auth"],
      });
      throw err;
    } finally {
      await ctx.close().catch(() => {});
    }
  }

  if (cmd === "run") {
    const ctx = await getAuthedContext();
    const max = process.argv[3] ? Number(process.argv[3]) : undefined;

    await telemetry.log({
      title: "Queue run started",
      level: "INFO",
      details: { maxItems: Number.isFinite(max) ? max : "∞" },
      tags: ["queue"],
    });

    try {
      await runQueue(ctx, { maxItems: Number.isFinite(max) ? max : undefined });
      await telemetry.log({ title: "Queue run finished", level: "SUCCESS", tags: ["queue"] });
      await ctx.close();
      return;
    } catch (err) {
      await telemetry.error(
        { title: "Queue run crashed", err, details: { max }, tags: ["queue"] }
      );
      throw err;
    } finally {
      await ctx.close().catch(() => {});
    }
  }

  if (cmd === "collect") {
    const ctx = await getAuthedContext();
    const page = await ctx.newPage();

    let grandTotalCollected = 0;
    let grandTotalAdded = 0;

    await telemetry.log({
      title: "Collect started",
      level: "INFO",
      details: { categories: CATEGORIES.length },
      tags: ["collect"],
    });

    try {
      for (const seed of CATEGORIES) {
        await telemetry.log({
          title: "Collecting category",
          level: "INFO",
          details: { category: seed.category, url: seed.categoryUrl },
          tags: ["collect"],
        });

        const urls = await collectListingUrls({ page, categoryUrl: seed.categoryUrl });

        const result = enqueueUrls({
          urls,
          category: seed.category,
          categoryUrl: seed.categoryUrl,
        });

        await telemetry.log({
          title: "Category collected",
          level: "SUCCESS",
          details: {
            category: seed.category,
            found: urls.length,
            added: result.added,
            queueTotal: result.total,
          },
          tags: ["collect"],
        });

        grandTotalCollected += urls.length;
        grandTotalAdded += result.added;

        await page.waitForTimeout(1200 + Math.floor(Math.random() * 1200));
      }

      await telemetry.log({
        title: "Collect finished",
        level: "SUCCESS",
        details: { totalCollectedRaw: grandTotalCollected, totalAddedDeduped: grandTotalAdded },
        tags: ["collect"],
      });

      await ctx.close();
      return;
    } catch (err) {
      await telemetry.error({
        title: "Collect crashed",
        err,
        details: { totalCollectedRaw: grandTotalCollected, totalAddedDeduped: grandTotalAdded },
        tags: ["collect"],
      });
      throw err;
    } finally {
      await page.close().catch(() => {});
      await ctx.close().catch(() => {});
    }
  }

  if (cmd === "start") {
    const ctx = await getAuthedContext();
    const page = await ctx.newPage();
    const max = process.argv[3] ? Number(process.argv[3]) : undefined;

    await telemetry.log({
      title: "START pipeline kicked off",
      level: "INFO",
      details: { categories: CATEGORIES.length, maxItems: Number.isFinite(max) ? max : "∞" },
      tags: ["start"],
    });

    try {
      for (const seed of CATEGORIES) {
        await telemetry.log({
          title: "Collecting category",
          level: "INFO",
          details: { category: seed.category, url: seed.categoryUrl },
          tags: ["start", "collect"],
        });

        const urls = await collectListingUrls({ page, categoryUrl: seed.categoryUrl });
        const result = enqueueUrls({ urls, category: seed.category, categoryUrl: seed.categoryUrl });

        recordCategoryRun({
          category: seed.category,
          categoryUrl: seed.categoryUrl,
          collected: urls.length,
          addedToQueue: result.added,
          queueTotalAfter: result.total,
        });

        await telemetry.log({
          title: "Category queued",
          level: "SUCCESS",
          details: { category: seed.category, found: urls.length, added: result.added, queueTotal: result.total },
          tags: ["start", "collect"],
        });

        await page.waitForTimeout(1200 + Math.floor(Math.random() * 1200));
      }

      await page.close();

      await telemetry.log({
        title: "Scraping queue",
        level: "INFO",
        details: { maxItems: Number.isFinite(max) ? max : "∞" },
        tags: ["start", "queue"],
      });

      await runQueue(ctx, { maxItems: Number.isFinite(max) ? max : undefined });

      await telemetry.log({ title: "START finished successfully", level: "SUCCESS", tags: ["start"] });
      await ctx.close();
      return;
    } catch (err) {
      await telemetry.error({ title: "START crashed", err, details: { max }, tags: ["start"] });
      throw err;
    } finally {
      await page.close().catch(() => {});
      await ctx.close().catch(() => {});
    }
  }

  await telemetry.log({
    title: "Unknown command",
    level: "WARN",
    details: { cmd },
    tags: ["cli"],
    hint: "Use: login | check | collect | run | start",
  });

  console.log("Usage:");
  console.log("  npm run login");
  console.log("  npm run check");
  console.log("  npm run collect   # runs all categories in src/categories.ts");
  console.log("  npm run run [maxItems]");
  console.log("  npm run start [maxItems]   # collect all categories then scrape queue");
}

main().catch(async (e) => {
  await telemetry.error({
    title: "Unhandled fatal error",
    err: e,
    tags: ["fatal"],
  });
  console.error("❌ Error:", e?.message ?? e);
  process.exit(1);
});

main().catch((e) => {
  console.error('❌ Error:', e?.message ?? e);
  process.exit(1);
});
