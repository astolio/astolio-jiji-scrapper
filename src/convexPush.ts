export type LeadPayload = {
    source: "jiji" | "manual" | "referral" | "web" | "instagram" | "other";
    name: string;
    companyName?: string;
    category?: string;
    tags?: string[];
  
    phoneRaw?: string;
    phoneNormalized?: string;
    whatsapp?: string;
    email?: string;
    website?: string;
  
    status?: "new" | "contacted" | "replied" | "qualified" | "won" | "lost" | "do_not_contact";
    priority?: "low" | "normal" | "high";
  
    notes?: string;
    sourceMeta?: any;
  };
  
  export async function pushLeadToConvex(lead: LeadPayload) {
    const baseUrl = process.env.CONVEX_HTTP_URL; 
    const secret = process.env.CONVEX_SCRAPER_SECRET;
  
    if (!baseUrl) throw new Error("Missing env: CONVEX_HTTP_URL");
    if (!secret) throw new Error("Missing env: CONVEX_SCRAPER_SECRET");

    console.log("🌐 Convex endpoint:", baseUrl);

  
    const res = await fetch(`${baseUrl}/leads/ingest`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(lead),
    });
  
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Convex ingest failed (${res.status}): ${text}`);
    }
  
    return JSON.parse(text);
  }
  