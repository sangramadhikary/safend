'use client';
import { BrandLoader, FullscreenBrandLoader } from "./brand-loader";

interface LoadingAnimationProps {
  size?: "sm" | "md" | "lg" | "xs" | "xl";
  color?: "primary" | "red" | "white";
  showPercentage?: boolean;
  percentageValue?: number;
  className?: string;
  message?: string;
}

/**
 * Loading Animation - Uses Brand Loader (SE logo with red spinning arc)
 */
export function LoadingAnimation({ 
  size = "md", 
  className,
  message
}: LoadingAnimationProps) {
  return (
    <BrandLoader
      size={size}
      className={className}
      message={message}
    />
  );
}

/**
 * Full Page Loading - Fullscreen brand loader
 */
export function FullPageLoading({ message }: { message?: string }) {
  return <FullscreenBrandLoader message={message || "Loading..."} />;
}
