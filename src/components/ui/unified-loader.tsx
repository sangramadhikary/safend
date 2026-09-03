'use client';
import React from 'react';
import { cn } from '@/lib/utils';
import { BrandLoader, FullscreenBrandLoader, ContentBrandLoader } from './brand-loader';

interface UnifiedLoaderProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'brand' | 'gauge' | 'minimal' | 'button' | 'fullscreen' | 'premium';
  progress?: number;
  showProgress?: boolean;
  className?: string;
  message?: string;
}

/**
 * Unified Loader - Now defaults to Brand Loader (SE logo with red spinning arc)
 */
export function UnifiedLoader({
  size = 'md',
  variant = 'brand',
  progress,
  showProgress = false,
  className,
  message
}: UnifiedLoaderProps) {
  // Default to brand loader for all cases
  if (variant === 'brand' || variant === 'premium' || variant === 'gauge') {
    return <BrandLoader size={size} className={className} message={message} />;
  }

  if (variant === 'minimal') {
    return <MinimalLoader size={size} className={className} />;
  }

  if (variant === 'button') {
    return <ButtonLoader size={size} className={className} />;
  }

  if (variant === 'fullscreen') {
    return <FullscreenBrandLoader message={message} />;
  }

  // Default to brand loader
  return <BrandLoader size={size} className={className} message={message} />;
}

// Minimal spinner - small red arc spinner
function MinimalLoader({ 
  size = 'md', 
  className 
}: { 
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; 
  className?: string; 
}) {
  const sizeMap = { xs: 12, sm: 16, md: 20, lg: 24, xl: 32 };
  const diameter = sizeMap[size];

  return (
    <div className={cn('flex items-center justify-center', className)}>
      <div 
        className="border-2 border-red-600 border-t-transparent rounded-full animate-spin"
        style={{ width: diameter, height: diameter }}
      />
    </div>
  );
}

// Button loader - for inline button loading states
function ButtonLoader({ 
  size = 'sm', 
  className 
}: { 
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; 
  className?: string; 
}) {
  const sizeMap = { xs: 10, sm: 12, md: 16, lg: 20, xl: 24 };
  const diameter = sizeMap[size];

  return (
    <div className={cn('inline-flex items-center', className)}>
      <div 
        className="border-2 border-current border-t-transparent rounded-full animate-spin"
        style={{ width: diameter, height: diameter }}
      />
    </div>
  );
}

// Re-export brand loader variants
export { BrandLoader, FullscreenBrandLoader, ContentBrandLoader };
export { MinimalLoader, ButtonLoader };

// Legacy exports for backward compatibility
export const GaugeLoader = BrandLoader;
export const PremiumLoader = BrandLoader;
export const FullscreenLoader = FullscreenBrandLoader;
