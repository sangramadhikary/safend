'use client';

import dynamic from 'next/dynamic';
import { Post } from "@/types/operations";
import { Card } from "@/components/ui/card";
import { usePermissions } from "@/hooks/operations/usePermissions";

// Lazy-load MapboxMap: ~200KB+ library, requires browser APIs (no SSR)
const MapboxMap = dynamic(() => import("../dashboard/MapboxMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[400px] rounded-lg bg-muted/50 animate-pulse flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Loading map...</p>
    </div>
  ),
});

interface PostMapViewProps {
  posts: Post[];
  onSelectPost: (postId: string) => void;
  className?: string; // Add className prop
}

export function PostMapView({ posts, onSelectPost, className }: PostMapViewProps) {
  const { hasPermission } = usePermissions();
  const canManagePosts = hasPermission("POST_MANAGEMENT");
  
  const handlePostSelect = (postId: string) => {
    if (canManagePosts) {
      onSelectPost(postId);
    }
  };

  return (
    <div className={`h-[600px] ${className || ''}`}>
      <MapboxMap 
        posts={posts}
        config={{
          showLabels: true,
          clusterMarkers: true,
          mapStyle: 'streets'
        }}
        onPostSelect={handlePostSelect}
      />
    </div>
  );
}
