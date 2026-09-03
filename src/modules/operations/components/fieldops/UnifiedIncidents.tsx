'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle, CheckCircle2, Clock, Eye,
  Shield, Users, Filter,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PatrolIncident {
  id: string;
  source: 'operations';
  date: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  status: 'open' | 'acknowledged' | 'in_progress' | 'resolved';
  officer?: string;
  site?: string;
  createdAt: string;
}

interface ClientIncident {
  id: string;
  source: 'client';
  date: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  status: 'open' | 'acknowledged' | 'in_progress' | 'resolved';
  clientName?: string;
  postName?: string;
  createdAt: string;
}

type UnifiedIncident = PatrolIncident | ClientIncident;

type FilterTab = 'all' | 'open' | 'in_progress' | 'resolved';

// ─── Severity Config ──────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  critical: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  medium: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  low: { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' },
} as const;

const STATUS_CONFIG = {
  open: { icon: AlertTriangle, bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', label: 'Open' },
  acknowledged: { icon: Eye, bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', label: 'Acknowledged' },
  in_progress: { icon: Clock, bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', label: 'In Progress' },
  resolved: { icon: CheckCircle2, bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-200', label: 'Resolved' },
} as const;

// ─── Component ────────────────────────────────────────────────────────────────

export function UnifiedIncidents() {
  const [incidents, setIncidents] = useState<UnifiedIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [updating, setUpdating] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchAllIncidents();
  }, []);

  const fetchAllIncidents = async () => {
    setLoading(true);
    try {
      // Fetch patrol incidents (patrol_logs where issues_found is not empty)
      const { data: patrolData, error: patrolError } = await supabase
        .from('patrol_logs')
        .select('*')
        .neq('issues_found', '')
        .not('issues_found', 'is', null)
        .order('patrol_date', { ascending: false });

      if (patrolError) throw patrolError;

      const patrolIncidents: PatrolIncident[] = (patrolData || []).map((p: any) => ({
        id: p.id,
        source: 'operations' as const,
        date: p.patrol_date,
        type: 'patrol_issue',
        severity: 'medium' as const, // Default severity for patrol issues
        title: `Issue at ${p.sites_visited || 'patrol site'}`,
        description: p.issues_found,
        status: p.incident_status || 'open',
        officer: p.officer_name,
        site: p.sites_visited,
        createdAt: p.created_at,
      }));

      // Fetch client portal incidents
      const { data: clientData, error: clientError } = await supabase
        .from('client_incidents')
        .select('*')
        .order('created_at', { ascending: false });

      if (clientError) throw clientError;

      const clientIncidents: ClientIncident[] = (clientData || []).map((c: any) => ({
        id: c.id,
        source: 'client' as const,
        date: c.created_at?.split('T')[0] || '',
        type: c.incident_type || 'other',
        severity: c.severity || 'medium',
        title: c.title,
        description: c.description,
        status: c.status || 'open',
        clientName: c.client_name,
        postName: c.post_name,
        createdAt: c.created_at,
      }));

      // Merge and sort by date (newest first)
      const merged = [...patrolIncidents, ...clientIncidents].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setIncidents(merged);
    } catch (err: any) {
      console.error('Error fetching incidents:', err);
      toast({
        title: 'Error',
        description: 'Failed to load incidents',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Filter incidents
  const filteredIncidents = incidents.filter((inc) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'open') return inc.status === 'open';
    if (activeFilter === 'in_progress') return inc.status === 'in_progress' || inc.status === 'acknowledged';
    if (activeFilter === 'resolved') return inc.status === 'resolved';
    return true;
  });

  // Counts for filter badges
  const openCount = incidents.filter(i => i.status === 'open').length;
  const inProgressCount = incidents.filter(i => i.status === 'in_progress' || i.status === 'acknowledged').length;
  const resolvedCount = incidents.filter(i => i.status === 'resolved').length;

  // Actions
  const handleStatusUpdate = async (incident: UnifiedIncident, newStatus: string) => {
    setUpdating(incident.id);
    try {
      if (incident.source === 'client') {
        const { error } = await supabase
          .from('client_incidents')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', incident.id);
        if (error) throw error;
      } else {
        // For patrol incidents, update a status field
        const { error } = await supabase
          .from('patrol_logs')
          .update({ incident_status: newStatus })
          .eq('id', incident.id);
        if (error) throw error;
      }

      toast({ title: 'Updated', description: `Incident marked as ${newStatus.replace('_', ' ')}` });
      fetchAllIncidents();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to update status', variant: 'destructive' });
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filter Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1">
          <FilterButton active={activeFilter === 'all'} onClick={() => setActiveFilter('all')}>
            All ({incidents.length})
          </FilterButton>
          <FilterButton active={activeFilter === 'open'} onClick={() => setActiveFilter('open')}>
            Open {openCount > 0 && <Badge className="ml-1.5 h-5 px-1.5 text-[10px] bg-red-500">{openCount}</Badge>}
          </FilterButton>
          <FilterButton active={activeFilter === 'in_progress'} onClick={() => setActiveFilter('in_progress')}>
            In Progress ({inProgressCount})
          </FilterButton>
          <FilterButton active={activeFilter === 'resolved'} onClick={() => setActiveFilter('resolved')}>
            Resolved ({resolvedCount})
          </FilterButton>
        </div>

        <Button variant="outline" size="sm" onClick={fetchAllIncidents}>
          <Filter className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : filteredIncidents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-300 mx-auto mb-3" />
            <h4 className="font-semibold text-lg mb-1">No Incidents</h4>
            <p className="text-muted-foreground">
              {activeFilter === 'all'
                ? 'No incidents reported from patrols or clients'
                : `No ${activeFilter.replace('_', ' ')} incidents`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredIncidents.map((incident) => (
            <IncidentCard
              key={`${incident.source}-${incident.id}`}
              incident={incident}
              onAcknowledge={() => handleStatusUpdate(incident, 'acknowledged')}
              onResolve={() => handleStatusUpdate(incident, 'resolved')}
              isUpdating={updating === incident.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function IncidentCard({
  incident,
  onAcknowledge,
  onResolve,
  isUpdating,
}: {
  incident: UnifiedIncident;
  onAcknowledge: () => void;
  onResolve: () => void;
  isUpdating: boolean;
}) {
  const severity = SEVERITY_CONFIG[incident.severity] || SEVERITY_CONFIG.medium;
  const status = STATUS_CONFIG[incident.status] || STATUS_CONFIG.open;
  const StatusIcon = status.icon;

  return (
    <Card className={`overflow-hidden border-l-4 ${
      incident.severity === 'critical' ? 'border-l-red-500' :
      incident.severity === 'high' ? 'border-l-orange-500' :
      incident.severity === 'medium' ? 'border-l-amber-400' :
      'border-l-gray-300'
    }`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            {/* Source + Severity + Type */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Source Badge */}
              {incident.source === 'operations' ? (
                <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px]">
                  <Shield className="h-3 w-3 mr-1" />
                  Operations
                </Badge>
              ) : (
                <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px]">
                  <Users className="h-3 w-3 mr-1" />
                  Client
                </Badge>
              )}
              {/* Severity */}
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${severity.bg} ${severity.text}`}>
                {incident.severity}
              </span>
              {/* Type */}
              <span className="text-xs text-muted-foreground capitalize">
                {incident.type.replace(/_/g, ' ')}
              </span>
              {/* Date */}
              <span className="text-xs text-muted-foreground">
                • {new Date(incident.createdAt).toLocaleDateString('en-IN')}
              </span>
            </div>

            {/* Title */}
            <h4 className="font-medium text-sm">{incident.title}</h4>

            {/* Description */}
            <p className="text-sm text-muted-foreground line-clamp-2">{incident.description}</p>

            {/* Context Info */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {incident.source === 'operations' && (incident as PatrolIncident).officer && (
                <span>Officer: {(incident as PatrolIncident).officer}</span>
              )}
              {incident.source === 'operations' && (incident as PatrolIncident).site && (
                <span>Site: {(incident as PatrolIncident).site}</span>
              )}
              {incident.source === 'client' && (incident as ClientIncident).clientName && (
                <span>Client: {(incident as ClientIncident).clientName}</span>
              )}
              {incident.source === 'client' && (incident as ClientIncident).postName && (
                <span>Post: {(incident as ClientIncident).postName}</span>
              )}
            </div>
          </div>

          {/* Status + Actions */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            {/* Status Badge */}
            <span className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${status.bg} ${status.text} ${status.border}`}>
              <StatusIcon className="h-3 w-3" />
              {status.label}
            </span>

            {/* Actions */}
            {incident.status !== 'resolved' && (
              <div className="flex gap-1.5 mt-1">
                {incident.status === 'open' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={onAcknowledge}
                    disabled={isUpdating}
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    Acknowledge
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                  onClick={onResolve}
                  disabled={isUpdating}
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Resolve
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
