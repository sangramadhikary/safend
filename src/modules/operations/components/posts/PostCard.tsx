'use client';

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { MapPin, Clock, ChevronDown, ChevronUp, Users } from "lucide-react";
import type { OperationalPost } from "@/services/supabase/OperationalPostService";
import { PostServiceDisplay } from "../PostServiceDisplay";
import { ServiceChips } from "./PostInfographics";
import { getPostMetrics } from "./postMetrics";

interface PostCardProps {
  post: OperationalPost;
  index: number;
}

export function PostCard({ post, index }: PostCardProps) {
  const [showServices, setShowServices] = useState(false);
  const metrics = getPostMetrics(post);
  const addressParts = [post.location?.address, post.location?.city, post.location?.state, post.location?.pincode].filter(Boolean);
  const address = addressParts.join(", ");
  const isActive = post.status === "active";
  const hasServices = metrics.activeServiceKeys.length > 0;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="p-4 space-y-3">
        {/* Row 1: name + status */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold truncate">{post.postName || `Post ${index + 1}`}</div>
            {address && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{address}</p>
            )}
          </div>
          <Badge variant={isActive ? "default" : "secondary"} className={isActive ? "bg-green-600" : ""}>
            {isActive ? "Active" : post.status}
          </Badge>
        </div>

        {/* Row 2: key facts */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {post.postCode && <Badge variant="outline">{post.postCode}</Badge>}
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />{post.shiftType || "8H"}
          </Badge>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Users className="h-3 w-3" />{metrics.totalGuards} guards
          </span>
          {metrics.byShift.day > 0 && (
            <span className="text-muted-foreground">Day {metrics.byShift.day}</span>
          )}
          {metrics.byShift.night > 0 && (
            <span className="text-muted-foreground">Night {metrics.byShift.night}</span>
          )}
        </div>

        {/* Row 3: service chips */}
        {hasServices && <ServiceChips byService={metrics.byService} />}
      </div>

      {/* Expandable deep service table */}
      {hasServices && (
        <Collapsible open={showServices} onOpenChange={setShowServices}>
          <button
            type="button"
            onClick={() => setShowServices((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs font-medium text-safend-red border-t hover:bg-secondary/50 transition-colors"
          >
            <span>Service Details</span>
            {showServices ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <CollapsibleContent>
            <div className="px-4 pb-4">
              <PostServiceDisplay post={post} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
