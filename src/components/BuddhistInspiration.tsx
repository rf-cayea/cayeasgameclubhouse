import { BUDDHIST_QUOTES, QUOTE_TRANSLATOR, QUOTE_LICENSE_URL } from '@/lib/buddhist-quotes';

export function BuddhistInspiration({ index, milestone }: { index: number; milestone?: number }) {
  const quote = BUDDHIST_QUOTES[Math.max(0, index) % BUDDHIST_QUOTES.length]!;
  return <figure className="monastery-inspiration"><figcaption className="gems-eyebrow">{milestone ? `LEVEL ${milestone} MILESTONE · A MOMENT OF REFLECTION` : 'A MOMENT OF REFLECTION'}</figcaption><blockquote>“{quote.text}”</blockquote><cite><a href={quote.url} target="_blank" rel="noreferrer">{quote.reference}</a><span>Translated by {QUOTE_TRANSLATOR} · <a href={QUOTE_LICENSE_URL} target="_blank" rel="noreferrer">CC0 public-domain dedication</a></span></cite></figure>;
}
