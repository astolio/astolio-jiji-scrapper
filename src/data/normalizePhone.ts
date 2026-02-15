export function normalizePhone(raw: string): string {
    let s = raw.trim();
  
    // Remove spaces, hyphens, parentheses
    s = s.replace(/[\s\-()]/g, '');
  
    // Remove leading +
    if (s.startsWith('+')) s = s.slice(1);
  
    // Handle 07xxxxxxxx / 01xxxxxxxx
    if (s.startsWith('07') && s.length === 10) return `254${s.slice(1)}`;
    if (s.startsWith('01') && s.length === 10) return `254${s.slice(1)}`;
  
    // Handle 7xxxxxxxx / 1xxxxxxxx
    if (s.startsWith('7') && s.length === 9) return `254${s}`;
    if (s.startsWith('1') && s.length === 9) return `254${s}`;
  
    // If already 254...
    if (s.startsWith('254') && (s.length === 12)) return s;
  
    // Fallback: return cleaned string (better than lying)
    return s;
  }
  