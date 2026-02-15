import fs from 'fs';
import path from 'path';
import { ensureDir } from '../utils/fs';
import type { Lead } from '../types';

const LEADS_PATH = path.resolve(process.cwd(), 'storage', 'leads.json');

function loadLeads(): Lead[] {
  ensureDir(path.dirname(LEADS_PATH));
  if (!fs.existsSync(LEADS_PATH)) return [];
  const raw = fs.readFileSync(LEADS_PATH, 'utf8');
  return JSON.parse(raw) as Lead[];
}

function saveLeads(leads: Lead[]) {
  ensureDir(path.dirname(LEADS_PATH));
  fs.writeFileSync(LEADS_PATH, JSON.stringify(leads, null, 2), 'utf8');
}

/**
 * Dedupe rule:
 * - Primary: phoneNormalized (best for outreach)
 * - Secondary fallback: listingUrl (prevents duplicates if phone extraction is weird)
 */
export function upsertLead(lead: Lead): { inserted: boolean; reason?: string } {
  const leads = loadLeads();

  const existsByPhone = leads.some((l) => l.phoneNormalized === lead.phoneNormalized);
  if (existsByPhone) {
    return { inserted: false, reason: 'duplicate_phone' };
  }

  const existsByUrl = leads.some((l) => l.listingUrl === lead.listingUrl);
  if (existsByUrl) {
    return { inserted: false, reason: 'duplicate_url' };
  }

  leads.push(lead);
  saveLeads(leads); // ✅ updated after every scrape
  return { inserted: true };
}
