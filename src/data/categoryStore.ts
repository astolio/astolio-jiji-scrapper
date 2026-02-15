import fs from 'fs';
import path from 'path';
import { ensureDir } from '../utils/fs';

export interface CategoryRun {
  category: string;
  categoryUrl: string;

  lastCollectedAt?: string;
  totalCollected?: number; // raw urls found on page
  totalAddedToQueue?: number; // deduped added

  runs: Array<{
    collectedAt: string;
    collected: number;
    addedToQueue: number;
    queueTotalAfter: number;
  }>;
}

const CATS_PATH = path.resolve(process.cwd(), 'storage', 'categories.json');

function nowIso() {
  return new Date().toISOString();
}

export function loadCategories(): CategoryRun[] {
  ensureDir(path.dirname(CATS_PATH));
  if (!fs.existsSync(CATS_PATH)) return [];
  return JSON.parse(fs.readFileSync(CATS_PATH, 'utf8')) as CategoryRun[];
}

export function saveCategories(rows: CategoryRun[]) {
  ensureDir(path.dirname(CATS_PATH));
  fs.writeFileSync(CATS_PATH, JSON.stringify(rows, null, 2), 'utf8');
}

export function recordCategoryRun(params: {
  category: string;
  categoryUrl: string;
  collected: number;
  addedToQueue: number;
  queueTotalAfter: number;
}) {
  const cats = loadCategories();
  const idx = cats.findIndex(
    (c) => c.categoryUrl === params.categoryUrl || c.category === params.category
  );

  const entry = {
    collectedAt: nowIso(),
    collected: params.collected,
    addedToQueue: params.addedToQueue,
    queueTotalAfter: params.queueTotalAfter,
  };

  if (idx === -1) {
    cats.push({
      category: params.category,
      categoryUrl: params.categoryUrl,
      lastCollectedAt: entry.collectedAt,
      totalCollected: params.collected,
      totalAddedToQueue: params.addedToQueue,
      runs: [entry],
    });
  } else {
    const existing = cats[idx];
    existing.lastCollectedAt = entry.collectedAt;
    existing.totalCollected = (existing.totalCollected ?? 0) + params.collected;
    existing.totalAddedToQueue = (existing.totalAddedToQueue ?? 0) + params.addedToQueue;
    existing.runs = [...(existing.runs ?? []), entry];
    cats[idx] = existing;
  }

  saveCategories(cats);
}
