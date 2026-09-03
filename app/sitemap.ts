import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/seo/siteConfig';
import { SERVICES } from '@/data/services';
import { getAllPosts, getCategories } from '@/data/blog';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = SITE.url;
  const now = new Date();

  const corePages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/services`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/privacy-policy`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];

  // Per-service deep links (anchor fragments) so search engines can surface
  // individual service sections from /services as separate results when relevant.
  const serviceAnchors: MetadataRoute.Sitemap = SERVICES.map((s) => ({
    url: `${baseUrl}/services#${s.id}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  // Individual blog posts — each is its own indexable URL.
  const blogPosts: MetadataRoute.Sitemap = getAllPosts().map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(post.updatedDate ?? post.publishedDate),
    changeFrequency: 'yearly',
    priority: post.featured ? 0.8 : 0.7,
  }));

  // Blog category pages — one per distinct category.
  const categoryPages: MetadataRoute.Sitemap = getCategories().map((cat) => ({
    url: `${baseUrl}/blog/category/${encodeURIComponent(cat.toLowerCase().replace(/\s+/g, '-'))}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  return [...corePages, ...serviceAnchors, ...blogPosts, ...categoryPages];
}
