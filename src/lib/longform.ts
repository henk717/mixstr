import { extractContentTags } from './mentions';
import { sanitizeUrl } from './sanitizeUrl';

/** Slugify a title for use in an addressable event d-tag. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 64);
}

/** Build a unique d-tag identifier for a long-form article. */
export function buildArticleIdentifier(title: string): string {
  const slug = slugify(title) || 'article';
  return `${slug}-${Date.now()}`;
}

export interface LongFormInput {
  title: string;
  summary: string;
  content: string;
  image?: string;
}

/**
 * Build NIP-23 tags for a kind 30023 long-form article.
 * Includes title, d, published_at, summary, image and inline p/t references.
 */
export function buildLongFormTags(input: LongFormInput): string[][] {
  const tags: string[][] = [];
  const now = Math.floor(Date.now() / 1000);

  tags.push(['d', buildArticleIdentifier(input.title)]);
  tags.push(['title', input.title.trim()]);
  tags.push(['published_at', String(now)]);

  const summary = input.summary.trim();
  if (summary) tags.push(['summary', summary]);

  const image = sanitizeUrl(input.image);
  if (image) tags.push(['image', image]);

  tags.push(...extractContentTags(input.content));

  return tags;
}
