import fs from 'fs';
import path from 'path';
import { ensureDir } from '../utils/fs';
import type { QueueItem, QueueStatus } from '../types';

const QUEUE_PATH = path.resolve(process.cwd(), 'storage', 'queue.json');

function nowIso() {
  return new Date().toISOString();
}

export function loadQueue(): QueueItem[] {
  ensureDir(path.dirname(QUEUE_PATH));
  if (!fs.existsSync(QUEUE_PATH)) return [];
  const raw = fs.readFileSync(QUEUE_PATH, 'utf8');
  return JSON.parse(raw) as QueueItem[];
}

export function saveQueue(items: QueueItem[]) {
  ensureDir(path.dirname(QUEUE_PATH));
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(items, null, 2), 'utf8');
}

export function enqueueUrls(params: {
  urls: string[];
  category: string;
  categoryUrl: string;
}): { added: number; total: number } {
  const queue = loadQueue();

  const byUrl = new Map(queue.map((q) => [q.url, q]));
  let added = 0;

  for (const url of params.urls) {
    if (byUrl.has(url)) continue;

    const item: QueueItem = {
      url,
      category: params.category,
      categoryUrl: params.categoryUrl,
      status: 'queued',
      attempts: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    queue.push(item);
    byUrl.set(url, item);
    added++;
  }

  saveQueue(queue);
  return { added, total: queue.length };
}


export function getNextQueued(): QueueItem | null {
    const queue = loadQueue();
    return queue.find((q) => q.status === 'queued') ?? null;
  }
  
  export function updateQueueItem(url: string, patch: Partial<QueueItem>) {
    const queue = loadQueue();
    const idx = queue.findIndex((q) => q.url === url);
    if (idx === -1) return;
  
    queue[idx] = {
      ...queue[idx],
      ...patch,
      updatedAt: nowIso(),
    };
  
    saveQueue(queue);
  }
  
  export function markStatus(url: string, status: QueueStatus) {
    updateQueueItem(url, { status });
  }
  
  export function incrementAttempts(url: string) {
    const queue = loadQueue();
    const idx = queue.findIndex((q) => q.url === url);
    if (idx === -1) return;
  
    queue[idx] = {
      ...queue[idx],
      attempts: (queue[idx].attempts ?? 0) + 1,
      updatedAt: nowIso(),
    };
  
    saveQueue(queue);
  }