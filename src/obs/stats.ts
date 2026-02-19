export type Stats = {
    startedAt: number;
  
    processed: number;
    scrapedOk: number;
    pushedOk: number;
    dupes: number;
  
    failedScrape: number;
    failedPush: number;
  
    scrapeMsTotal: number;
    pushMsTotal: number;
  
    byCategory: Record<string, number>;
    errors: Record<string, number>;
  };
  
  export function createStats(): Stats {
    return {
      startedAt: Date.now(),
      processed: 0,
      scrapedOk: 0,
      pushedOk: 0,
      dupes: 0,
      failedScrape: 0,
      failedPush: 0,
      scrapeMsTotal: 0,
      pushMsTotal: 0,
      byCategory: {},
      errors: {},
    };
  }
  
  export function bump(map: Record<string, number>, key: string) {
    map[key] = (map[key] ?? 0) + 1;
  }
  
  export function ms(n?: number) {
    if (!n || !Number.isFinite(n)) return "—";
    if (n < 1000) return `${Math.round(n)}ms`;
    return `${(n / 1000).toFixed(2)}s`;
  }
  
  export function pct(part: number, total: number) {
    if (!total) return "0%";
    return `${Math.round((part / total) * 100)}%`;
  }
  
  export function renderSummary(s: Stats) {
    const elapsed = Date.now() - s.startedAt;
    const avgScrape = s.scrapedOk ? s.scrapeMsTotal / s.scrapedOk : 0;
    const avgPush = s.pushedOk ? s.pushMsTotal / s.pushedOk : 0;
  
    const topErrors = Object.entries(s.errors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${v}× ${k}`)
      .join(" | ");
  
    const topCats = Object.entries(s.byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => `${v} ${k}`)
      .join(" | ");
  
    return `
  📊 Run Summary
  - Elapsed: ${ms(elapsed)}
  - Processed: ${s.processed}
  - Scraped OK: ${s.scrapedOk} (${pct(s.scrapedOk, s.processed)})
  - Pushed OK: ${s.pushedOk} (${pct(s.pushedOk, s.scrapedOk)})
  - Dupes: ${s.dupes}
  - Failed (scrape): ${s.failedScrape}
  - Failed (push): ${s.failedPush}
  
  ⏱️ Timing
  - Avg scrape: ${ms(avgScrape)}
  - Avg push: ${ms(avgPush)}
  
  🏷️ Top categories
  - ${topCats || "—"}
  
  💥 Top errors
  - ${topErrors || "—"}
  `.trim();
  }
  