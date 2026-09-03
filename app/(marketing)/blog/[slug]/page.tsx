import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import BlogPostContent from '@/components/marketing/BlogPostContent';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  blogPostingSchema,
  breadcrumbSchema,
  faqPageSchema,
} from '@/lib/seo/schemas';
import { getAllPosts, getPostBySlug, getRelatedPosts } from '@/data/blog';
import { SITE, absoluteUrl } from '@/lib/seo/siteConfig';

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

/** Pre-render every post at build time. */
export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return { title: 'Article not found' };
  }

  const url = `${SITE.url}/blog/${post.slug}`;

  return {
    title: post.title,
    description: post.excerpt,
    keywords: post.tags,
    authors: [{ name: post.author.name }],
    alternates: {
      canonical: `/blog/${post.slug}`,
    },
    openGraph: {
      type: 'article',
      url,
      title: post.title,
      description: post.excerpt,
      publishedTime: post.publishedDate,
      modifiedTime: post.updatedDate ?? post.publishedDate,
      authors: [post.author.name],
      section: post.category,
      tags: post.tags,
      images: [
        {
          url: absoluteUrl(post.coverImage),
          width: SITE.ogImageWidth,
          height: SITE.ogImageHeight,
          alt: post.coverImageAlt,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
      images: [absoluteUrl(post.coverImage)],
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const related = getRelatedPosts(post.slug);

  return (
    <>
      <JsonLd
        data={[
          blogPostingSchema(post),
          breadcrumbSchema([
            { name: 'Home', url: '/' },
            { name: 'Blog', url: '/blog' },
            { name: post.title, url: `/blog/${post.slug}` },
          ]),
          ...(post.faqs && post.faqs.length > 0
            ? [faqPageSchema([...post.faqs])]
            : []),
        ]}
      />
      <BlogPostContent post={post} related={related} />
    </>
  );
}
