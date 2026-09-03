/**
 * Blog content model.
 *
 * The shape is deliberately structured (sections, key takeaways, TL;DR, FAQs)
 * rather than a single HTML blob so the same data can power:
 *   - the rendered article (semantic HTML + table of contents)
 *   - Article / BlogPosting JSON-LD (SEO)
 *   - FAQPage JSON-LD + concise answers (AEO — answer engines)
 *   - extractable, citation-friendly takeaways (GEO — generative engines)
 *
 * Defined in a plain module (no 'use client') so both server and client
 * components can import the same data.
 */

export interface BlogAuthor {
  /** Display name shown in the byline and emitted as schema.org Person. */
  name: string;
  /** Role / title — reinforces author expertise (E-E-A-T). */
  role: string;
  /** Optional avatar image path under /public. */
  avatar?: string;
}

export interface BlogSection {
  /** Stable anchor id used by the in-page table of contents. */
  id: string;
  /** Section heading rendered as an <h2>. */
  heading: string;
  /** Body paragraphs for the section. */
  paragraphs: string[];
  /** Optional bullet list rendered after the paragraphs. */
  bullets?: string[];
}

export interface BlogFaq {
  question: string;
  answer: string;
}

export interface BlogPost {
  /** URL slug — also the route segment at /blog/[slug]. */
  slug: string;
  /** Headline (<= ~60 chars for clean SERP titles). */
  title: string;
  /** One-line summary used for cards, meta description, and OG. */
  excerpt: string;
  /** Primary topic category, shown as a pill and used in schema. */
  category: string;
  /** Free-form tags for related-content matching and keywords. */
  tags: string[];
  author: BlogAuthor;
  /** ISO date (YYYY-MM-DD) the post was published. */
  publishedDate: string;
  /** ISO date the post was last updated (defaults to publishedDate). */
  updatedDate?: string;
  /** Estimated reading time in minutes. */
  readingTime: number;
  /** Cover image path under /public. */
  coverImage: string;
  /** Descriptive alt text for the cover image. */
  coverImageAlt: string;
  /** Surfaced first on the index page. */
  featured?: boolean;
  /**
   * AEO/GEO summary block — a direct, quotable answer to the post's core
   * question. Rendered near the top and ideal for AI answer extraction.
   */
  tldr: string;
  /** Scannable, citation-friendly key points. */
  keyTakeaways: string[];
  /** Structured article body. */
  content: BlogSection[];
  /** Optional Q&A — rendered visibly and emitted as FAQPage schema. */
  faqs?: BlogFaq[];
}
