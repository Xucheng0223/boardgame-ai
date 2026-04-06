const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 10;

type Entry = { count: number; windowStart: number };

const store = new Map<string, Entry>();

export async function checkRateLimit(ip: string): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    store.set(ip, { count: 1, windowStart: now });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= MAX_REQUESTS) {
    return { allowed: false, retryAfterMs: WINDOW_MS - (now - entry.windowStart) };
  }

  entry.count++;
  return { allowed: true, retryAfterMs: 0 };
}
