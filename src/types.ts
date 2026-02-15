export type QueueStatus = 'queued' | 'processing' | 'done' | 'failed' | 'skipped';

export interface QueueItem {
  url: string;
  category: string;
  categoryUrl: string;
  status: QueueStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}



export interface Lead {
    sellerName: string;
    phoneRaw: string;
    phoneNormalized: string;
  
    listingTitle: string;
    listingUrl: string;
  
    category: string;
    categoryUrl: string;
  
    scrapedAt: string;
  }
  