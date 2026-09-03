import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbSchema } from '@/lib/seo/schemas';
import { getAllPosts, getCategories } from '@/data/blog';
import { SITE } from '@/lib/seo/siteConfig';
import BlogCategoryContent from '@/components/marketing/BlogCategoryContent';

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

/** Slugify a category name to match the URL pattern */
function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-');
}

/** Pre-render all category pages at build time */
export function generateStaticParams() {
  return getCategories().map((cat) => ({ slug: slugify(cat) }));
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const categories = getCategories();
  const category = categories.find((c) => slugify(c) === slug);

  if (!category) {
    return { title: 'Category not found' };
  }

  return {
    title: `${category} — Blog`,
    description: `Articles about ${category.toLowerCase()} from ${SITE.name}. Practical security guides and insights for India.`,
    alternates: {
      canonical: `/blog/category/${slug}`,
    },
    openGraph: {
      url: `${SITE.url}/blog/category/${slug}`,
      type: 'website',
      title: `${category} | ${SITE.name} Blog`,
      description: `All articles in ${category} — practical security guides and insights.`,
    },
  };
}

export default async function BlogCategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const categories = getCategories();
  const category = categories.find((c) => slugify(c) === slug);

  if (!category) {
    notFound();
  }

  const posts = getAllPosts().filter((p) => slugify(p.category) === slug);

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Home', url: '/' },
            { name: 'Blog', url: '/blog' },
            { name: category, url: `/blog/category/${slug}` },
          ]),
        ]}
      />
      <BlogCategoryContent category={category} posts={posts} />
    </>
  );
}
