'use client';

import { useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft,
  ArrowUpRight,
  Clock,
  CalendarDays,
  Check,
  Sparkles,
  Share2,
} from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import type { BlogPost } from '@/types/blog';
import { formatDateLong, getInitials } from '@/lib/utils';

gsap.registerPlugin(ScrollTrigger, useGSAP);

interface BlogPostContentProps {
  post: BlogPost;
  related: BlogPost[];
}

export default function BlogPostContent({ post, related }: BlogPostContentProps) {
  const pageRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.from('.post-hero > *', {
        opacity: 0,
        y: 24,
        duration: 0.8,
        ease: 'power3.out',
        stagger: 0.08,
        delay: 0.15,
      });
      gsap.from('.post-cover', {
        opacity: 0,
        scale: 0.98,
        duration: 0.9,
        ease: 'power3.out',
        delay: 0.3,
      });
      gsap.utils.toArray<HTMLElement>('.post-section').forEach((el) => {
        gsap.from(el, {
          opacity: 0,
          y: 30,
          duration: 0.7,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 88%',
            toggleActions: 'play none none none',
          },
        });
      });
    },
    { scope: pageRef }
  );

  const updated = post.updatedDate && post.updatedDate !== post.publishedDate;
  const shareUrl = `https://www.safend.in/blog/${post.slug}`;
  const shareText = `${post.title} — ${post.excerpt}`;

  return (
    <div ref={pageRef} className="bg-safend-canvas">
      {/* ════════════ HERO ════════════ */}
      <section className="w-full pt-[110px] lg:pt-[140px] pb-[30px] lg:pb-[40px]">
        <div className="max-w-4xl mx-auto px-6 sm:px-10 lg:px-0">
          <div className="post-hero">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-[13px] font-body text-safend-muted hover:text-safend-ink transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              All articles
            </Link>

            <div className="mt-7 flex flex-wrap items-center gap-3 text-[11px] font-body uppercase tracking-[0.12em] text-safend-muted">
              <Link
                href={`/blog/category/${encodeURIComponent(post.category.toLowerCase().replace(/\s+/g, '-'))}`}
                className="rounded-full bg-safend-red/10 px-3 py-1 text-safend-red font-semibold hover:bg-safend-red/20 transition-colors"
              >
                {post.category}
              </Link>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" />
                <time dateTime={post.publishedDate}>
                  {formatDateLong(post.publishedDate)}
                </time>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {post.readingTime} min read
              </span>
            </div>

            <h1
              className="mt-6 font-display font-bold text-safend-ink leading-[1.03] tracking-tight"
              style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}
            >
              {post.title}
            </h1>

            <p className="mt-5 text-[17px] font-body text-safend-slate-grey leading-[1.7]">
              {post.excerpt}
            </p>

            {/* Author byline + share */}
            <div className="mt-7 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-full bg-safend-ink text-white flex items-center justify-center font-heading font-semibold text-[14px]">
                  {getInitials(post.author.name)}
                </span>
                <div>
                  <p className="text-[14px] font-heading font-semibold text-safend-ink leading-tight">
                    {post.author.name}
                  </p>
                  <p className="text-[12px] font-body text-safend-muted leading-tight">
                    {post.author.role}
                  </p>
                </div>
              </div>

              {/* Social share */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-body text-safend-muted uppercase tracking-widest hidden sm:inline">
                  Share
                </span>
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-full border border-safend-mist flex items-center justify-center text-safend-muted hover:text-safend-ink hover:border-safend-ink transition-colors"
                  aria-label="Share on LinkedIn"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                </a>
                <a
                  href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(post.title)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-full border border-safend-mist flex items-center justify-center text-safend-muted hover:text-safend-ink hover:border-safend-ink transition-colors"
                  aria-label="Share on X (Twitter)"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-full border border-safend-mist flex items-center justify-center text-safend-muted hover:text-safend-ink hover:border-safend-ink transition-colors"
                  aria-label="Share on WhatsApp"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                </a>
                <button
                  onClick={() => {
                    if (navigator.share) {
                      navigator.share({ title: post.title, url: shareUrl });
                    } else {
                      navigator.clipboard.writeText(shareUrl);
                    }
                  }}
                  className="w-8 h-8 rounded-full border border-safend-mist flex items-center justify-center text-safend-muted hover:text-safend-ink hover:border-safend-ink transition-colors"
                  aria-label="Copy link"
                >
                  <Share2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Cover */}
          <div className="post-cover mt-9 relative overflow-hidden rounded-[20px] aspect-video">
            <Image
              src={post.coverImage}
              alt={post.coverImageAlt}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover"
              priority
            />
          </div>
        </div>
      </section>

      {/* ════════════ BODY ════════════ */}
      <article className="w-full pb-[60px] lg:pb-[90px]">
        <div className="max-w-4xl mx-auto px-6 sm:px-10 lg:px-0">
          {/* TL;DR — concise extractable answer for AEO/GEO */}
          <div className="post-section rounded-[18px] border border-safend-mist bg-white p-6 lg:p-7">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-safend-red" />
              <span className="text-[11px] font-heading font-semibold uppercase tracking-[0.14em] text-safend-ink">
                The short answer
              </span>
            </div>
            <p className="post-tldr text-[16px] font-body text-safend-ink/85 leading-[1.7]">
              {post.tldr}
            </p>
          </div>

          {/* Key takeaways */}
          <div className="post-section mt-8 rounded-[18px] bg-safend-ink p-6 lg:p-8">
            <p className="text-[11px] font-heading font-semibold uppercase tracking-[0.14em] text-safend-canvas/50 mb-5">
              Key takeaways
            </p>
            <ul className="space-y-3">
              {post.keyTakeaways.map((t) => (
                <li
                  key={t}
                  className="flex items-start gap-3 text-[15px] font-body text-safend-canvas/90 leading-[1.6]"
                >
                  <Check className="w-4 h-4 text-safend-red shrink-0 mt-1" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          {/* Table of contents */}
          <nav
            className="post-section mt-8 border-l-2 border-safend-mist pl-5"
            aria-label="Table of contents"
          >
            <p className="text-[11px] font-heading font-semibold uppercase tracking-[0.14em] text-safend-muted mb-3">
              On this page
            </p>
            <ol className="space-y-2">
              {post.content.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="text-[14px] font-body text-safend-slate-grey hover:text-safend-red transition-colors"
                  >
                    <span className="text-safend-muted tabular-nums mr-2">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {s.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {/* Sections */}
          <div className="mt-12 space-y-12">
            {post.content.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="post-section scroll-mt-28"
              >
                <h2 className="font-display font-bold text-safend-ink leading-[1.15] tracking-[-0.02em] text-[24px] lg:text-[30px]">
                  {section.heading}
                </h2>
                <div className="mt-4 space-y-4">
                  {section.paragraphs.map((p, i) => (
                    <p
                      key={i}
                      className="text-[16px] lg:text-[17px] font-body text-safend-slate-grey leading-[1.8]"
                    >
                      {p}
                    </p>
                  ))}
                </div>
                {section.bullets && (
                  <ul className="mt-5 space-y-2.5">
                    {section.bullets.map((b) => (
                      <li
                        key={b}
                        className="flex items-start gap-3 text-[15px] lg:text-[16px] font-body text-safend-ink/80 leading-[1.6]"
                      >
                        <span className="mt-2.5 w-1.5 h-1.5 rounded-full bg-safend-red shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          {updated && (
            <p className="mt-12 text-[13px] font-body text-safend-muted italic">
              Last updated{' '}
              <time dateTime={post.updatedDate as string}>
                {formatDateLong(post.updatedDate as string)}
              </time>
              .
            </p>
          )}

          {/* FAQs — visible + emitted as FAQPage schema by the route */}
          {post.faqs && post.faqs.length > 0 && (
            <div className="post-section mt-14">
              <h2 className="font-display font-bold text-safend-ink leading-[1.1] tracking-[-0.02em] text-[26px] lg:text-[32px]">
                Frequently asked questions
              </h2>
              <div className="mt-6 divide-y divide-safend-mist border-t border-safend-mist">
                {post.faqs.map((faq) => (
                  <details key={faq.question} className="group py-5">
                    <summary className="flex cursor-pointer items-start justify-between gap-4 list-none">
                      <span className="text-[16px] lg:text-[18px] font-heading font-semibold text-safend-ink leading-snug">
                        {faq.question}
                      </span>
                      <span className="mt-1 shrink-0 w-6 h-6 rounded-full border border-safend-mist flex items-center justify-center text-safend-ink transition-transform duration-300 group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <p className="mt-3 text-[15px] lg:text-[16px] font-body text-safend-slate-grey leading-[1.7]">
                      {faq.answer}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          <div className="post-section mt-12 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <Link
                key={tag}
                href={`/blog/category/${encodeURIComponent(tag.toLowerCase().replace(/\s+/g, '-'))}`}
                className="rounded-full border border-safend-mist px-3.5 py-1.5 text-[12px] font-body text-safend-ink/60 hover:border-safend-red hover:text-safend-red transition-colors"
              >
                #{tag}
              </Link>
            ))}
          </div>

          {/* Inline CTA */}
          <div className="post-section mt-14 rounded-[20px] bg-safend-red overflow-hidden p-8 lg:p-10 text-center">
            <h3
              className="font-display font-bold text-white leading-[1.05] tracking-[-0.02em]"
              style={{ fontSize: 'clamp(1.5rem, 3vw, 2.25rem)' }}
            >
              Need a security partner you can trust?
            </h3>
            <p className="mt-3 text-[15px] font-body text-white/85 max-w-md mx-auto leading-[1.6]">
              Tell us about your site and we&apos;ll put the right people on it.
            </p>
            <Link
              href="/contact"
              className="mt-7 inline-flex items-center gap-2 rounded-[10px] bg-white px-7 py-3.5 text-[13px] font-heading font-semibold uppercase tracking-[0.02em] text-safend-ink transition-transform duration-300 hover:-translate-y-0.5"
            >
              Get in touch
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </article>

      {/* ════════════ RELATED ════════════ */}
      {related.length > 0 && (
        <section className="w-full border-t border-safend-mist py-[60px] lg:py-[90px]">
          <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px]">
            <h2 className="font-display font-bold text-safend-ink leading-[0.95] tracking-[-0.03em] text-[24px] lg:text-[36px] mb-10">
              Keep reading<span className="text-safend-red">.</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 lg:gap-8">
              {related.map((p) => (
                <Link
                  key={p.slug}
                  href={`/blog/${p.slug}`}
                  className="group flex gap-5 rounded-[18px] border border-safend-mist bg-white overflow-hidden p-4 transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_24px_60px_-30px_rgba(20,20,20,0.28)]"
                >
                  <div className="relative shrink-0 w-28 sm:w-36 aspect-4/3 overflow-hidden rounded-[12px]">
                    <Image
                      src={p.coverImage}
                      alt={p.coverImageAlt}
                      fill
                      sizes="144px"
                      className="object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                    />
                  </div>
                  <div className="flex-1 min-w-0 py-1">
                    <span className="text-[10px] font-body uppercase tracking-[0.12em] text-safend-red">
                      {p.category}
                    </span>
                    <h3 className="mt-2 font-display font-bold text-safend-ink text-[16px] lg:text-[18px] leading-[1.15] line-clamp-3">
                      {p.title}
                    </h3>
                    <span className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-body text-safend-muted">
                      <Clock className="w-3.5 h-3.5" />
                      {p.readingTime} min read
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
