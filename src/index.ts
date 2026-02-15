import { loginAndSaveState } from './auth/login';
import { getAuthedContext } from './auth/session';
import { CONFIG } from './config';
import { collectListingUrls } from './scrape/collectListingUrls';
import { enqueueUrls } from './data/queueStore';
import { CATEGORIES } from './categories';
import { runQueue } from './scrape/runQueue';
import { recordCategoryRun } from './data/categoryStore';



async function main() {
  const cmd = process.argv[2];

  if (cmd === 'login') {
    await loginAndSaveState();
    console.log(`✅ Logged in. Saved storage state to: ${CONFIG.storageStatePath}`);
    return;
  }

  if (cmd === 'check') {
    const ctx = await getAuthedContext();
    const page = await ctx.newPage();
    await page.goto(CONFIG.checkUrl, { waitUntil: 'domcontentloaded' });
    console.log(`✅ Session looks valid. Current URL: ${page.url()}`);
    await ctx.close();
    return;
  }

  if (cmd === 'run') {
    const ctx = await getAuthedContext();
  
    // optional: limit per run (handy for testing)
    const max = process.argv[3] ? Number(process.argv[3]) : undefined;
  
    await runQueue(ctx, { maxItems: Number.isFinite(max) ? max : undefined });
    await ctx.close();
    return;
  }
  



  if (cmd === 'collect') {
    const ctx = await getAuthedContext();
    const page = await ctx.newPage();

    let grandTotalCollected = 0;
    let grandTotalAdded = 0;

    for (const seed of CATEGORIES) {
      console.log(`\n📌 Collecting: ${seed.category}`);
      console.log(`   ${seed.categoryUrl}`);

      const urls = await collectListingUrls({
        page,
        categoryUrl: seed.categoryUrl,
      });

      const result = enqueueUrls({
        urls,
        category: seed.category,
        categoryUrl: seed.categoryUrl,
      });

      console.log(`✅ Found ${urls.length} urls`);
      console.log(`✅ Added ${result.added} new urls (queue total: ${result.total})`);

      grandTotalCollected += urls.length;
      grandTotalAdded += result.added;

      // Small cooldown between categories (keeps it human-ish)
      await page.waitForTimeout(1200 + Math.floor(Math.random() * 1200));
    }


    

    console.log(`\n🎯 Done.`);
    console.log(`Total collected (raw): ${grandTotalCollected}`);
    console.log(`Total added to queue (deduped): ${grandTotalAdded}`);

    await ctx.close();
    return;
  }


  if (cmd === 'start') {
    const ctx = await getAuthedContext();
    const page = await ctx.newPage();
  
    console.log('🚀 START: collecting categories → scraping queue');
  
    // 1) COLLECT all categories
    for (const seed of CATEGORIES) {
      console.log(`\n📌 Collecting: ${seed.category}`);
      console.log(`   ${seed.categoryUrl}`);
  
      const urls = await collectListingUrls({ page, categoryUrl: seed.categoryUrl });
      const result = enqueueUrls({
        urls,
        category: seed.category,
        categoryUrl: seed.categoryUrl,
      });
  
      recordCategoryRun({
        category: seed.category,
        categoryUrl: seed.categoryUrl,
        collected: urls.length,
        addedToQueue: result.added,
        queueTotalAfter: result.total,
      });
  
      console.log(`✅ Found ${urls.length} urls`);
      console.log(`✅ Added ${result.added} new urls (queue total: ${result.total})`);
  
      // cooldown between categories
      await page.waitForTimeout(1200 + Math.floor(Math.random() * 1200));
    }
  
    await page.close();
  
    // 2) SCRAPE queue until empty (or optional limit)
    const max = process.argv[3] ? Number(process.argv[3]) : undefined;
    await runQueue(ctx, { maxItems: Number.isFinite(max) ? max : undefined });
  
    await ctx.close();
    console.log('✅ START finished.');
    return;
  }
  

  

  console.log('Usage:');
  console.log('  npm run login');
  console.log('  npm run check');
  console.log('  npm run collect   # runs all categories in src/categories.ts');
  console.log('  npm run run [maxItems]');
  console.log('  npm run start [maxItems]   # collect all categories then scrape queue');


}

main().catch((e) => {
  console.error('❌ Error:', e?.message ?? e);
  process.exit(1);
});
