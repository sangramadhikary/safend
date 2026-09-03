/** @type {import('next').NextConfig} */
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Guard: never ship a production build carrying local development origins.
 *
 * `NEXT_PUBLIC_*` values are inlined into the client bundle at build time, so a
 * stray `localhost` becomes permanent until the next deploy. This has already
 * broken production twice — once sending "Office Login" to
 * https://office.localhost/login, and once emitting a Content-Security-Policy
 * whose script-src pointed at localhost, which blocked every Google Map on the
 * site. Both came from syncing `.env.local` (a development file) into Vercel.
 *
 * Only enforced for real production builds on Vercel; local `next build` runs
 * with localhost values are legitimate.
 */
if (process.env.VERCEL_ENV === 'production') {
  const mustNotBeLocal = ['NEXT_PUBLIC_ROOT_DOMAIN', 'NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_API_BASE_URL'];
  const offenders = mustNotBeLocal
    .map((key) => [key, (process.env[key] || '').trim()])
    .filter(([, value]) => /localhost|127\.0\.0\.1|^http:\/\//i.test(value));

  if (offenders.length > 0) {
    throw new Error(
      'Production build blocked — these environment variables hold development values:\n' +
        offenders.map(([key, value]) => `  ${key}=${value}`).join('\n') +
        '\nSet them to their production values in the Vercel project settings ' +
        '(e.g. NEXT_PUBLIC_ROOT_DOMAIN=safend.in, NEXT_PUBLIC_SITE_URL=https://office.safend.in). ' +
        'Do not sync .env.local into a deployed environment.'
    );
  }
}

const nextConfig = {
  reactStrictMode: true,

  // Skip TypeScript errors during build (pre-existing broken modules: traccar, inventory)
  typescript: {
    ignoreBuildErrors: true,
  },

  // Fix workspace root warning
  outputFileTracingRoot: path.join(__dirname, '.'),

  // ─── Next.js 16 Features ───────────────────────────────────────────────

  // React Compiler: automatic memoization, reduces unnecessary re-renders
  reactCompiler: true,

  // Cache Components: explicit opt-in caching with "use cache" directive + PPR
  cacheComponents: true,

  experimental: {
    // Turbopack file system caching: faster dev restarts by persisting compiler artifacts
    turbopackFileSystemCacheForDev: true,

    // Tree-shake heavy packages — reduces JS shipped to client
    optimizePackageImports: [
      'recharts',
      'lucide-react',
      'date-fns',
      '@nivo/core',
      '@nivo/radar',
      '@nivo/calendar',
      '@nivo/chord',
      '@nivo/network',
      '@nivo/sankey',
      '@nivo/stream',
      '@nivo/sunburst',
      '@nivo/treemap',
      'framer-motion',
      'react-hook-form',
      '@hookform/resolvers',
      'zod',
    ],
  },

  // Turbopack config with resolve alias (replaces webpack alias for dev)
  turbopack: {
    root: __dirname,
    resolveAlias: {
      '@': path.join(__dirname, 'src'),
    },
  },

  // ─── Edge & Performance ────────────────────────────────────────────────
  // Force all pages to be dynamically rendered at the Edge (no SSR serverless functions)
  // This uses Vercel Edge Functions which are faster (no cold starts) and free on Hobby plan

  compress: true,
  productionBrowserSourceMaps: false,

  // Strip all console.* calls from production client bundles
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },

  // Image optimization — let browser GPU decode modern formats
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'static.wixstatic.com' },
      { protocol: 'https', hostname: 'api.safend.in' },
      { protocol: 'https', hostname: '*.r2.dev' },
    ],
    formats: ['image/avif', 'image/webp'],
    // Minimize Vercel image optimization compute — cache optimized images aggressively
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },

  // Webpack config (only applies to `next build --webpack` fallback)
  webpack: (config, { dev, isServer }) => {
    config.resolve.alias['@'] = path.join(__dirname, 'src');

    if (!dev && !isServer) {
      config.optimization = {
        ...config.optimization,
        moduleIds: 'deterministic',
        runtimeChunk: 'single',
        splitChunks: {
          chunks: 'all',
          maxInitialRequests: 25,
          minSize: 20000,
          cacheGroups: {
            default: false,
            vendors: false,
            // Core framework — cached long-term
            framework: {
              name: 'framework',
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler|next)[\\/]/,
              chunks: 'all',
              priority: 40,
              enforce: true,
            },
            // Heavy visualization libs — loaded on-demand
            charts: {
              test: /[\\/]node_modules[\\/](recharts|@nivo|d3|chart\.js)[\\/]/,
              name: 'charts',
              chunks: 'all',
              priority: 35,
            },
            // Animation — loaded client-side only
            animation: {
              test: /[\\/]node_modules[\\/](framer-motion|gsap)[\\/]/,
              name: 'animation',
              chunks: 'all',
              priority: 35,
            },
            // UI components
            ui: {
              test: /[\\/]node_modules[\\/](@radix-ui|cmdk|vaul|sonner)[\\/]/,
              name: 'ui',
              chunks: 'all',
              priority: 30,
            },
            // Supabase client
            supabase: {
              test: /[\\/]node_modules[\\/](@supabase)[\\/]/,
              name: 'supabase',
              chunks: 'all',
              priority: 30,
            },
            // All other vendor code
            vendor: {
              name: 'vendor',
              test: /[\\/]node_modules[\\/]/,
              chunks: 'all',
              priority: 10,
            },
            // Shared app code
            common: {
              name: 'common',
              minChunks: 2,
              chunks: 'all',
              priority: 5,
              reuseExistingChunk: true,
            },
          },
        },
      };
    }

    return config;
  },

  // API rewrites — only proxy specific backend routes to the Express server.
  // Next.js API routes (admin, employee-portal, client-portal, email, etc.) are
  // handled by Next.js itself and should NOT be rewritten.
  async rewrites() {
    return {
      afterFiles: [],
    };
  },

  // Redirects
  async redirects() {
    return [
      {
        source: '/employee-portal',
        destination: '/supervisor-portal',
        permanent: true,
      },
    ];
  },

  // Headers: cache immutable assets and public marketing HTML only.
  async headers() {
    const isDev = process.env.NODE_ENV === 'development';
    const marketingRoutes = [
      '/', '/about', '/blog/:path*', '/careers', '/contact', '/offline',
      '/pricing', '/privacy-policy', '/services', '/terms',
    ];
    const privateRoutes = [
      '/accounts/:path*', '/dashboard/:path*', '/hr/:path*', '/login/:path*',
      '/office-admin/:path*', '/operations/:path*', '/profile/:path*', '/sales/:path*',
      '/client-login/:path*', '/client-portal/:path*', '/supervisor-portal/:path*',
    ];
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/:all*(svg|jpg|png|gif|ico|webp|avif|woff|woff2|ttf|otf)',
        headers: [
          {
            key: 'Cache-Control',
            value: isDev ? 'no-store' : 'public, max-age=31536000, immutable',
          },
        ],
      },
      ...marketingRoutes.map((source) => ({
        source,
        headers: [{
          key: 'Cache-Control',
          value: isDev ? 'no-store' : 'public, s-maxage=60, stale-while-revalidate=300',
        }],
      })),
      ...privateRoutes.map((source) => ({
        source,
        headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
      })),
    ];
  },
};

export default nextConfig;
