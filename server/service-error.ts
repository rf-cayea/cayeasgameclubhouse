/** Useful production failures without logging request headers, tokens or player data. */
export function serviceErrorDetails(error: unknown): string {
  const messages: string[] = [];
  let current = error;
  for (let depth = 0; depth < 3 && current; depth++) {
    if (typeof current !== 'object') break;
    const value = current as { name?: unknown; message?: unknown; cause?: unknown };
    if (typeof value.message === 'string') messages.push(`${typeof value.name === 'string' ? value.name : 'Error'}: ${value.message}`);
    current = value.cause;
  }
  return messages.join(' · ')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token]')
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/g, '[key]')
    .replace(/https?:\/\/[^\s"']+/g, '[url]')
    .replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi, '[id]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .slice(0, 700) || 'Unknown server failure';
}
