'use client';
import React from 'react';
import { cn } from '@/lib/utils';
import { BrandLoader, ContentBrandLoader } from './brand-loader';

interface ModernLoaderProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  variant?: 'dual-ring' | 'skeleton' | 'pulse' | 'brand';
  className?: string;
  message?: string;
}

/**
 * Modern Loader - Now defaults to Brand Loader (SE logo with red spinning arc)
 */
export function ModernLoader({
  size = 'md',
  variant = 'brand',
  className,
  message
}: ModernLoaderProps) {
  // Default to brand loader
  if (variant === 'brand' || variant === 'dual-ring' || variant === 'pulse') {
    return <BrandLoader size={size} className={className} message={message} />;
  }

  if (variant === 'skeleton') {
    return (
      <div className={cn('space-y-3', className)}>
        <SkeletonLoader />
        {message && (
          <p className="text-sm text-muted-foreground text-center">{message}</p>
        )}
      </div>
    );
  }

  return <BrandLoader size={size} className={className} message={message} />;
}

function SkeletonLoader() {
  return (
    <div className="space-y-3">
      <div className="h-4 bg-muted rounded animate-pulse" />
      <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
      <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
    </div>
  );
}

/**
 * Centered Loader - For content areas
 */
export function CenteredLoader({
  size = 'md',
  message = 'Loading...',
  className
}: ModernLoaderProps) {
  return (
    <div className={cn(
      'flex items-center justify-center min-h-[200px] w-full',
      className
    )}>
      <BrandLoader size={size} message={message} />
    </div>
  );
}
