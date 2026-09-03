import { NavigationBar } from '@/components/marketing/NavigationBar';
import { Footer } from '@/components/marketing/Footer';
import { ChatWidget } from '@/components/marketing/ChatWidget';
import { SmoothScroll } from '@/components/marketing/SmoothScroll';
import { LoadingScreen } from '@/components/marketing/LoadingScreen';
import { CookieConsent } from '@/components/marketing/CookieConsent';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  organizationSchema,
  websiteSchema,
  localBusinessSchema,
} from '@/lib/seo/schemas';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Site-wide structured data — emitted in every marketing page's HTML
          so AI engines and search crawlers can identify the organisation,
          the website, and the local business behind it on any landing page. */}
      <JsonLd
        data={[
          organizationSchema(),
          websiteSchema(),
          localBusinessSchema(),
        ]}
      />

      {/* Fixed/overlay elements live OUTSIDE the smooth-content transform,
          otherwise position:fixed breaks (transformed ancestor becomes the
          containing block). */}
      <LoadingScreen />
      <NavigationBar />
      <ChatWidget />
      <CookieConsent />

      {/* Only the scrolling page content goes inside ScrollSmoother */}
      <SmoothScroll>
        <div className="min-h-screen w-full overflow-x-hidden flex flex-col bg-safend-canvas">
          <main className="w-full flex-1">{children}</main>
          <Footer />
        </div>
      </SmoothScroll>
    </>
  );
}
