'use client';

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Building2, FileText, MapPin, Users, Phone, Mail,
  ChevronDown, ChevronUp,
} from "lucide-react";
import type { OperationalPost } from "@/services/supabase/OperationalPostService";
import { PostCard } from "./PostCard";
import { ServiceChips } from "./PostInfographics";
import { aggregatePostMetrics } from "./postMetrics";

export interface ClientPostsGroupView {
  clientName: string;
  quotationId: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  posts: OperationalPost[];
  totalPosts: number;
  activePosts: number;
  totalGuards: number;
}

interface ClientPostCardProps {
  group: ClientPostsGroupView;
  isOpen: boolean;
  onToggle: () => void;
}

export function ClientPostCard({ group, isOpen, onToggle }: ClientPostCardProps) {
  const metrics = aggregatePostMetrics(group.posts);
  const isActive = group.activePosts > 0;

  return (
    <Card className="overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={onToggle}>
        <CollapsibleTrigger className="w-full text-left">
          <div className="flex items-center justify-between p-5 hover:bg-secondary/30 transition-colors">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-10 h-10 rounded-full bg-safend-red/10 flex items-center justify-center shrink-0">
                <Building2 className="h-5 w-5 text-safend-red" />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="font-bold text-base truncate">{group.clientName}</div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{group.quotationId}</span>
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{group.totalPosts} {group.totalPosts === 1 ? "post" : "posts"}</span>
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{metrics.totalGuards} guards</span>
                  {group.contactPhone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{group.contactPhone}</span>}
                  {group.contactEmail && <span className="flex items-center gap-1 truncate"><Mail className="h-3 w-3" />{group.contactEmail}</span>}
                </div>
                {/* Service type chips — visible without expanding */}
                {metrics.activeServiceKeys.length > 0 && (
                  <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                    <ServiceChips byService={metrics.byService} />
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              <Badge variant={isActive ? "default" : "secondary"} className={isActive ? "bg-green-600" : ""}>
                {isActive ? "Active" : "Inactive"}
              </Badge>
              {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t p-5 bg-secondary/20">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {group.posts.map((post, idx) => (
                <PostCard key={post.id || `post-${idx}`} post={post} index={idx} />
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
