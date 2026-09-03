'use client';
import { cn } from '@/lib/utils';

interface BrandLoaderProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  message?: string;
  fullscreen?: boolean;
}

const sizeScales = {
  xs: 0.5,
  sm: 0.75,
  md: 1,
  lg: 1.5,
  xl: 2,
};

/**
 * Brand Loader - Animated dot loader with red/white Safend brand colors
 */
export function BrandLoader({
  size = 'md',
  className,
  message,
  fullscreen = false
}: BrandLoaderProps) {
  const scale = sizeScales[size];

  const loaderContent = (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <div className="safend-loader" style={{ transform: `scale(${scale})` }} />
      {message && (
        <p className="text-sm font-medium text-muted-foreground animate-pulse">
          {message}
        </p>
      )}
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-gray-950 flex items-center justify-center z-50">
        {loaderContent}
      </div>
    );
  }

  return loaderContent;
}

/**
 * Fullscreen Brand Loader - For page transitions and initial loading
 */
export function FullscreenBrandLoader({ message }: { message?: string }) {
  return <BrandLoader size="xl" fullscreen message={message} />;
}

/**
 * Inline Brand Loader - For buttons and small loading states
 */
export function InlineBrandLoader({ size = 'sm' }: { size?: 'xs' | 'sm' }) {
  return <BrandLoader size={size} />;
}

/**
 * Content Area Brand Loader - For loading content sections
 */
export function ContentBrandLoader({ message }: { message?: string }) {
  return (
    <div className="flex items-center justify-center min-h-[200px] w-full bg-white dark:bg-gray-950 rounded-lg">
      <BrandLoader size="lg" message={message} />
    </div>
  );
}

export default BrandLoader;
