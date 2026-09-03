'use client';
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandLoader } from "@/components/ui/brand-loader";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue, 
} from "@/components/ui/select";
import { 
  MapPin, Search, Building2, RefreshCw, 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { subscribeToOperationalPosts, type OperationalPost } from "@/services/supabase/OperationalPostService";
import { supabaseClient } from "@/integrations/supabase/client";
import { PostSummaryStrip } from "./posts/PostSummaryStrip";
import { ClientPostCard } from "./posts/ClientPostCard";

interface ClientPostsGroup {
  clientName: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  quotationId: string;
  posts: OperationalPost[];
  totalPosts: number;
  activePosts: number;
  totalGuards: number;
  securityServices?: any;
  serviceInstances?: any; // New format support
  gstNumber?: string;
  gstPercentage?: number;
  gstExempt?: boolean;
  totalAmount?: string;
}

export function PostManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("guards");
  const [posts, setPosts] = useState<OperationalPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openClients, setOpenClients] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  useEffect(() => {
    try {
      const unsubscribe = subscribeToOperationalPosts(async (operationalPosts) => {
        // Show posts where work order is In Progress, Completed, or client is onboarded
        const activePosts = operationalPosts.filter(post => 
          post.workOrderStatus === 'In Progress' || 
          post.workOrderStatus === 'Completed' ||
          post.workOrderStatus === 'in_progress' ||
          post.workOrderStatus === 'completed' ||
          post.status === 'active'
        );
        
        // Enrich posts with data from agreements
        const enrichedPosts = await Promise.all(activePosts.map(async (post) => {
          // Try to get agreement data for this quotation (try both quotation_id and quotation_ref)
          const { data: agreements, error } = await supabaseClient
            .from('agreements')
            .select('posts, service_details, id, quotation_id, quotation_ref')
            .or(`quotation_id.eq.${post.quotationId},quotation_ref.eq.${post.quotationId}`);
          
          if (agreements && agreements.length > 0) {
            if (agreements[0].posts) {
              const agreementPosts = agreements[0].posts as any[];
              
              // Find matching post in agreement by name
              const matchingPost = agreementPosts.find((ap: any) => 
                ap.name === post.postName || ap.postName === post.postName
              );
              
              if (matchingPost) {
                // Copy service data from agreement post
                return {
                  ...post,
                  serviceInstances: matchingPost.serviceInstances || post.serviceInstances,
                  securityServices: matchingPost.securityServices || post.securityServices
                };
              }
            }
          }
          
          return post;
        }));
        
        setPosts(enrichedPosts);
        setIsLoading(false);
        setError(null);
      });
      return () => unsubscribe();
    } catch (err) {
      setError((err as Error).message);
      setIsLoading(false);
    }
  }, []);

  // Get unique client names for dropdown
  const uniqueClients = Array.from(new Set(posts.map(post => post.clientName || "Unknown Client"))).sort();

  // Group posts by client and quotation
  const groupedPosts: ClientPostsGroup[] = posts.reduce((acc, post) => {
    const clientName = post.clientName || "Unknown Client";
    const quotationId = post.quotationId || "Unknown";
    const groupKey = `${clientName}-${quotationId}`;
    const existingGroup = acc.find(g => g.clientName === clientName && g.quotationId === quotationId);
    
    if (existingGroup) {
      existingGroup.posts.push(post);
      existingGroup.totalPosts++;
      if (post.status === 'active') existingGroup.activePosts++;
      existingGroup.totalGuards += post.totalGuards || 0;
    } else {
      acc.push({
        clientName,
        quotationId,
        contactPerson: post.contactPerson,
        contactEmail: post.contactEmail,
        contactPhone: post.contactPhone,
        posts: [post],
        totalPosts: 1,
        activePosts: post.status === 'active' ? 1 : 0,
        totalGuards: post.totalGuards || 0,
        securityServices: post.securityServices,
        serviceInstances: post.serviceInstances, // New format support
        gstNumber: post.gstNumber,
        gstPercentage: post.gstPercentage,
        gstExempt: post.gstExempt,
        totalAmount: post.totalAmount
      });
    }
    return acc;
  }, [] as ClientPostsGroup[]);

  const filteredGroups = groupedPosts
    .filter(group => {
      // Filter by selected client
      if (selectedClient !== "all" && group.clientName !== selectedClient) {
        return false;
      }
      // Filter by status
      if (statusFilter === "active" && group.activePosts === 0) return false;
      if (statusFilter === "inactive" && group.activePosts > 0) return false;
      // Filter by search term
      if (searchTerm) {
        return group.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          group.quotationId.toLowerCase().includes(searchTerm.toLowerCase()) ||
          group.posts.some(post => 
            post.postName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            post.postCode.toLowerCase().includes(searchTerm.toLowerCase())
          );
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "guards") return b.totalGuards - a.totalGuards;
      if (sortBy === "posts") return b.totalPosts - a.totalPosts;
      if (sortBy === "name") return a.clientName.localeCompare(b.clientName);
      return 0;
    });

  const toggleClient = (groupKey: string) => {
    setOpenClients(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) newSet.delete(groupKey);
      else newSet.add(groupKey);
      return newSet;
    });
  };

  const handleRefresh = () => {
    setIsLoading(true);
    toast({ title: "Refreshing", description: "Loading posts from completed Work Orders..." });
    setTimeout(() => setIsLoading(false), 1000);
  };

  // Removed: handleAddFakeData() and handleFixPostsData().
  //
  // Neither was wired to any control, and both performed unscoped production
  // writes. handleAddFakeData overwrote service_instances on EVERY operational
  // post with hard-coded sample staffing; handleFixPostsData overwrote every
  // agreement's posts from its quotation. Correcting post configuration is now
  // done by re-deriving it from the work order -- see
  // scripts/maintenance/resync-post-config.mjs and syncPostsFromStartedWorkOrder.

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-xl font-bold">Operational Posts</h3>
          <p className="text-sm text-muted-foreground">Active client posts from onboarded work orders</p>
        </div>
        <Button onClick={handleRefresh} variant="outline" size="sm" className="flex gap-2 items-center border-[#D71920] text-[#D71920] hover:bg-[#D71920] hover:text-white">
          <RefreshCw className="h-4 w-4" />Refresh
        </Button>
      </div>

      {/* Summary infographic strip */}
      {!isLoading && !error && posts.length > 0 && (
        <PostSummaryStrip posts={posts} clientCount={filteredGroups.length} />
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <Select value={selectedClient} onValueChange={setSelectedClient}>
          <SelectTrigger className="w-full md:w-52">
            <Building2 className="h-4 w-4 mr-2 text-[#D71920]" />
            <SelectValue placeholder="All Clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {uniqueClients.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full md:w-44">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="guards">Most Guards</SelectItem>
            <SelectItem value="posts">Most Posts</SelectItem>
            <SelectItem value="name">Client Name</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by quotation, post name..." className="pl-9" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <BrandLoader size="lg" message="Loading posts..." />
        </div>
      ) : error ? (
        <div className="p-6 text-center text-red-500 text-sm">{error}</div>
      ) : filteredGroups.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
            <MapPin className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold mb-1">No Posts Found</h3>
          <p className="text-sm text-muted-foreground">
            {searchTerm ? "No posts match your search." : "Posts appear here after clients are onboarded."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredGroups.map(group => {
            const groupKey = `${group.clientName}-${group.quotationId}`;
            return (
              <ClientPostCard
                key={groupKey}
                group={group}
                isOpen={openClients.has(groupKey)}
                onToggle={() => toggleClient(groupKey)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
