import type { Metadata } from 'next';
import BlogIndexContent from '@/components/marketing/BlogIndexContent';
import { JsonLd } from '@/components/seo/JsonLd';
import { blogSchema, breadcrumbSchema } from '@/lib/seo/schemas';
import { getAllPosts } from '@/data/blog';
import { SITE } from '@/lib/seo/siteConfig';

export const metadata: Metadata = {
  title: 'Blog',
  description:
    `Security insights and practical guides from ${SITE.name} — choosing a security agency, armed vs unarmed guards, event security planning, and protecting people and property across India.`,
  alternates: {
    canonical: '/blog',
  },
  openGraph: {
    url: `${SITE.url}/blog`,
    type: 'website',
    title: `Blog | ${SITE.name}`,
    description:
      'Field-tested security advice and buyer guides from the team at Safend Secure Solutions.',
  },
};

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <>
      <JsonLd
        data={[
          blogSchema(posts),
          breadcrumbSchema([
            { name: 'Home', url: '/' },
            { name: 'Blog', url: '/blog' },
          ]),
        ]}
      />
      <BlogIndexContent />
    </>
  );
}
