'use client';

import { useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, Clock, CalendarDays } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { getAllPosts, getFeaturedPost } from '@/data/blog';
import { formatDateShort } from '@/lib/utils';
import type { BlogPost } from '@/types/blog';

gsap.registerPlugin(ScrollTrigger, useGSAP);

export default function BlogIndexContent() {
  const pageRef = useRef<HTMLDivElement>(null);
  const featured = getFeaturedPost();
  const rest = getAllPosts().filter((p) => p.slug !== featured.slug);

  useGSAP(
    () => {
      gsap.utils.toArray<HTMLElement>('.blog-hero-line').forEach((line, i) => {
        gsap.from(line, {
          yPercent: 120,
          duration: 1.0,
          ease: 'power4.out',
          delay: 0.2 + i * 0.1,
        });
      });
      gsap.from('.blog-hero-meta', {
        opacity: 0,
        y: 20,
        duration: 0.8,
        ease: 'power2.out',
        delay: 0.7,
      });
      gsap.from('.blog-featured', {
        opacity: 0,
        y: 40,
        duration: 0.9,
        ease: 'power3.out',
        delay: 0.4,
      });

      gsap.utils.toArray<HTMLElement>('.blog-card').forEach((card, i) => {
        gsap.from(card, {
          y: 50,
          opacity: 0,
          duration: 0.8,
          ease: 'power3.out',
          delay: (i % 3) * 0.08,
          scrollTrigger: {
            trigger: '.blog-grid',
            start: 'top 82%',
            toggleActions: 'play none none none',
          },
        });
      });
    },
    { scope: pageRef }
  );

  return (
    <div ref={pageRef} className="bg-safend-canvas">
      {/* ════════════ HERO ════════════ */}
      <section className="w-full pt-[120px] lg:pt-[150px] pb-[40px] lg:pb-[60px]">
        <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px]">
          <p className="blog-hero-meta text-[11px] font-body text-safend-muted uppercase tracking-[0.18em] mb-8">
            The Safend Journal
          </p>
          <h1
            className="font-display font-bold text-safend-ink leading-[0.86] tracking-[-0.04em]"
            style={{ fontSize: 'clamp(2.75rem, 9vw, 7.5rem)' }}
          >
            <span className="block overflow-hidden">
              <span className="blog-hero-line block">Security, made</span>
            </span>
            <span className="block overflow-hidden">
              <span className="blog-hero-line block">
                clear<span className="text-safend-red">.</span>
              </span>
            </span>
          </h1>
          <div className="blog-hero-meta mt-10 flex items-center gap-5">
            <div className="h-[2px] w-[50px] bg-safend-red" aria-hidden />
            <p className="text-[15px] font-body text-safend-slate-grey leading-[1.6] max-w-[460px]">
              Practical guides and field-tested advice on protecting people,
              property, and peace of mind — written by the people who do it.
            </p>
          </div>
        </div>
      </section>

      {/* ════════════ FEATURED ════════════ */}
      <section className="w-full pb-[60px] lg:pb-[90px]">
        <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px]">
          <Link
            href={`/blog/${featured.slug}`}
            className="blog-featured group relative grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12 items-center rounded-[24px] border border-safend-mist bg-white overflow-hidden p-4 sm:p-5 lg:p-6 transition-shadow duration-500 hover:shadow-[0_24px_70px_-30px_rgba(20,20,20,0.3)]"
          >
            <div className="relative overflow-hidden rounded-[16px] aspect-16/10">
              <Image
                src={featured.coverImage}
                alt={featured.coverImageAlt}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                priority
              />
              <span className="absolute top-4 left-4 z-10 rounded-full bg-safend-red px-3 py-1 text-[11px] font-heading font-semibold uppercase tracking-[0.08em] text-white">
                Featured
              </span>
            </div>
            <div className="lg:pr-8">
              <div className="flex items-center gap-3 text-[11px] font-body uppercase tracking-[0.12em] text-safend-muted">
                <span className="text-safend-red">{featured.category}</span>
                <span className="w-1 h-1 rounded-full bg-safend-mist" aria-hidden />
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {featured.readingTime} min read
                </span>
              </div>
              <h2
                className="mt-4 font-display font-bold text-safend-ink leading-[1.02] tracking-[-0.02em]"
                style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.75rem)' }}
              >
                {featured.title}
              </h2>
              <p className="mt-4 text-[15px] font-body text-safend-slate-grey leading-[1.7] max-w-[520px]">
                {featured.excerpt}
              </p>
              <span className="mt-7 inline-flex items-center gap-2 text-[13px] font-heading font-semibold uppercase tracking-[0.04em] text-safend-ink">
                Read article
                <span className="w-8 h-8 rounded-full bg-safend-ink text-white flex items-center justify-center transition-colors duration-300 group-hover:bg-safend-red">
                  <ArrowUpRight className="w-4 h-4 transition-transform duration-300 -rotate-45 group-hover:rotate-0" />
                </span>
              </span>
            </div>
          </Link>
        </div>
      </section>

      {/* ════════════ GRID ════════════ */}
      <section className="w-full pb-[90px] lg:pb-[130px]">
        <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px]">
          <div className="mb-10 flex items-end justify-between gap-6">
            <h2
              className="font-display font-bold text-safend-ink leading-[0.95] tracking-[-0.03em]"
              style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)' }}
            >
              Latest articles<span className="text-safend-red">.</span>
            </h2>
            <p className="hidden sm:block text-[13px] font-body text-safend-muted">
              {getAllPosts().length} articles
            </p>
          </div>

          <div className="blog-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-8">
            {rest.map((post) => (
              <ArticleCard key={post.slug} post={post} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ─── Card ───────────────────────────────────────────────────────────────── */
function ArticleCard({ post }: { post: BlogPost }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="blog-card group flex flex-col rounded-[18px] border border-safend-mist bg-white overflow-hidden transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_24px_60px_-30px_rgba(20,20,20,0.28)]"
    >
      <div className="relative overflow-hidden aspect-16/10">
        <Image
          src={post.coverImage}
          alt={post.coverImageAlt}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition-transform duration-700 group-hover:scale-[1.05]"
        />
        <span className="absolute top-3 left-3 z-10 rounded-full bg-white/90 backdrop-blur-xs px-3 py-1 text-[10px] font-heading font-semibold uppercase tracking-[0.08em] text-safend-ink">
          {post.category}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5 lg:p-6">
        <h3 className="font-display font-bold text-safend-ink text-[18px] lg:text-[20px] leading-[1.15] tracking-[-0.01em]">
          {post.title}
        </h3>
        <p className="mt-3 text-[14px] font-body text-safend-slate-grey leading-[1.6] line-clamp-3">
          {post.excerpt}
        </p>
        <div className="mt-auto pt-5 flex items-center justify-between text-[11px] font-body text-safend-muted">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" />
            <time dateTime={post.publishedDate}>
              {formatDateShort(post.publishedDate)}
            </time>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {post.readingTime} min
          </span>
        </div>
      </div>
    </Link>
  );
}
