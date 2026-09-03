'use client';

import { useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Clock, CalendarDays } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { formatDateShort } from '@/lib/utils';
import type { BlogPost } from '@/types/blog';

gsap.registerPlugin(ScrollTrigger, useGSAP);

interface BlogCategoryContentProps {
  category: string;
  posts: BlogPost[];
}

export default function BlogCategoryContent({
  category,
  posts,
}: BlogCategoryContentProps) {
  const pageRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.from('.cat-title', {
        opacity: 0,
        y: 30,
        duration: 0.9,
        ease: 'power3.out',
        delay: 0.2,
      });

      gsap.utils.toArray<HTMLElement>('.cat-card').forEach((card, i) => {
        gsap.from(card, {
          y: 50,
          opacity: 0,
          duration: 0.8,
          ease: 'power3.out',
          delay: 0.3 + i * 0.08,
          scrollTrigger: {
            trigger: '.cat-grid',
            start: 'top 85%',
            toggleActions: 'play none none none',
          },
        });
      });
    },
    { scope: pageRef }
  );

  return (
    <div ref={pageRef} className="bg-safend-canvas">
      <section className="w-full pt-[120px] lg:pt-[150px] pb-[60px] lg:pb-[90px]">
        <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px]">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-[13px] font-body text-safend-muted hover:text-safend-ink transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            All articles
          </Link>

          <div className="cat-title">
            <p className="text-[11px] font-body text-safend-muted uppercase tracking-[0.18em] mb-4">
              Category
            </p>
            <h1
              className="font-display font-bold text-safend-ink leading-[0.9] tracking-[-0.03em]"
              style={{ fontSize: 'clamp(2rem, 6vw, 4.5rem)' }}
            >
              {category}
              <span className="text-safend-red">.</span>
            </h1>
            <p className="mt-5 text-[15px] font-body text-safend-slate-grey leading-[1.6] max-w-[520px]">
              {posts.length} article{posts.length !== 1 ? 's' : ''} in this
              category.
            </p>
          </div>

          <div className="cat-grid mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-8">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="cat-card group flex flex-col rounded-[18px] border border-safend-mist bg-white overflow-hidden transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_24px_60px_-30px_rgba(20,20,20,0.28)]"
              >
                <div className="relative overflow-hidden aspect-16/10">
                  <Image
                    src={post.coverImage}
                    alt={post.coverImageAlt}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                  />
                </div>
                <div className="flex flex-1 flex-col p-5 lg:p-6">
                  <h2 className="font-display font-bold text-safend-ink text-[18px] lg:text-[20px] leading-[1.15] tracking-[-0.01em]">
                    {post.title}
                  </h2>
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
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
