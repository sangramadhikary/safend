import { getAllPosts } from '@/data/blog';
import { SITE, absoluteUrl } from '@/lib/seo/siteConfig';

/**
 * RSS 2.0 feed for the blog.
 * Accessible at /blog/feed.xml — discoverable via <link rel="alternate"> in the layout.
 */
export function GET() {
  const posts = getAllPosts();

  const items = posts
    .map(
      (post) => `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${SITE.url}/blog/${post.slug}</link>
      <guid isPermaLink="true">${SITE.url}/blog/${post.slug}</guid>
      <description><![CDATA[${post.excerpt}]]></description>
      <pubDate>${new Date(post.publishedDate).toUTCString()}</pubDate>
      <author>${SITE.email} (${post.author.name})</author>
      <category>${post.category}</category>
      ${post.tags.map((tag) => `<category>${tag}</category>`).join('\n      ')}
      <enclosure url="${absoluteUrl(post.coverImage)}" type="image/webp" />
    </item>`
    )
    .join('');

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${SITE.name} Blog</title>
    <link>${SITE.url}/blog</link>
    <description>Security insights, buyer guides, and practical advice from ${SITE.name}.</description>
    <language>en-IN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE.url}/blog/feed.xml" rel="self" type="application/rss+xml" />
    <image>
      <url>${absoluteUrl('/logo.png')}</url>
      <title>${SITE.name}</title>
      <link>${SITE.url}</link>
    </image>
    ${items}
  </channel>
</rss>`;

  return new Response(feed.trim(), {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
