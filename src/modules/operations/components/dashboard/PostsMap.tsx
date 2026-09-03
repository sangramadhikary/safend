'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { buildGoogleTileLayer, preloadGoogleMaps } from '@/lib/googleMaps';

// Pre-warm the Google Maps JS API as early as module load.
preloadGoogleMaps();

interface PostMapData {
  id: string;
  post_name: string;
  post_code: string;
  client_name: string;
  location: { latitude?: number; longitude?: number; address?: string; city?: string; state?: string } | null;
  total_guards: number;
  shift_type: string;
  status: string;
}

interface AttendanceSummary {
  present: number;
  absent: number;
  half_day: number;
  half_vacant: number;
  pending: number;
  total: number;
}

interface PostsMapProps {
  posts: PostMapData[];
  /** Attendance map: postId -> summary */
  attendanceByPost: Record<string, AttendanceSummary>;
  isLoading?: boolean;
  onViewDetails?: (postId: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  allPresent: '#16A34A',    // green - all guards present
  partial: '#F59E0B',       // amber - some absent
  allAbsent: '#DC2626',     // red - no one present
  pending: '#6B7280',       // gray - not yet marked
  noData: '#9CA3AF',        // light gray
};

function getAttendanceColor(summary?: AttendanceSummary): string {
  if (!summary || summary.total === 0) return STATUS_COLORS.noData;
  if (summary.present === summary.total) return STATUS_COLORS.allPresent;
  if (summary.present === 0 && summary.pending === 0) return STATUS_COLORS.allAbsent;
  if (summary.pending === summary.total) return STATUS_COLORS.pending;
  return STATUS_COLORS.partial;
}

function getAttendanceLabel(summary?: AttendanceSummary): string {
  if (!summary || summary.total === 0) return 'No attendance data';
  if (summary.present === summary.total) return 'All Present';
  if (summary.present === 0 && summary.pending === 0) return 'All Absent';
  if (summary.pending === summary.total) return 'Pending';
  return `${summary.present}/${summary.total} Present`;
}

export function PostsMap({ posts, attendanceByPost, isLoading, onViewDetails }: PostsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const popupRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);

  const handleDirections = useCallback((lat: number, lng: number, postName: string) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=&travelmode=driving`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let mounted = true;

    import('leaflet').then(async (L) => {
      if (!mounted || !containerRef.current) return;

      // Fix default icon
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(containerRef.current, {
        center: [20.5937, 78.9629],
        zoom: 5,
        zoomControl: true,
        attributionControl: false,
      });

      // Official Google Map Tiles API — keyed, billed, ToS-compliant.
      const tileLayer = await buildGoogleTileLayer('roadmap');
      tileLayer.addTo(map);

      mapRef.current = map;
      setMapReady(true);
    });

    return () => {
      mounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        setMapReady(false);
      }
    };
  }, []);

  // Invalidate map size when container resizes (e.g., expand/collapse)
  useEffect(() => {
    if (!containerRef.current || !mapRef.current) return;
    const observer = new ResizeObserver(() => {
      mapRef.current?.invalidateSize();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [mapReady]);

  // Update markers when posts or attendance data changes
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    import('leaflet').then((L) => {
      const map = mapRef.current;
      if (!map) return;

      // Clear old markers
      markersRef.current.forEach((m) => map.removeLayer(m));
      markersRef.current = [];

      const validPosts = posts.filter(
        (p) => p.location?.latitude && p.location?.longitude
      );

      if (validPosts.length === 0) return;

      const bounds: [number, number][] = [];

      validPosts.forEach((post) => {
        const lat = post.location!.latitude!;
        const lng = post.location!.longitude!;
        bounds.push([lat, lng]);

        const attSummary = attendanceByPost[post.id];
        const color = getAttendanceColor(attSummary);
        const label = getAttendanceLabel(attSummary);

        // Create circle marker
        const marker = L.circleMarker([lat, lng], {
          radius: 10,
          color: '#ffffff',
          weight: 2,
          fillColor: color,
          fillOpacity: 0.9,
        }).addTo(map);

        // Hover tooltip with attendance status
        const tooltipContent = `
          <div style="min-width:180px;font-family:system-ui,sans-serif">
            <div style="font-weight:600;font-size:13px;margin-bottom:4px">${post.post_name}</div>
            <div style="font-size:11px;color:#666;margin-bottom:6px">${post.client_name || 'No client'}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block"></span>
              <span style="font-size:12px;font-weight:500">${label}</span>
            </div>
            ${attSummary && attSummary.total > 0 ? `
              <div style="font-size:11px;color:#888;border-top:1px solid #eee;padding-top:4px;margin-top:4px">
                ✓ ${attSummary.present} Present · ✗ ${attSummary.absent} Absent · ◐ ${attSummary.half_day} Half${attSummary.pending > 0 ? ` · ◌ ${attSummary.pending} Pending` : ''}
              </div>
            ` : ''}
            <div style="font-size:10px;color:#999;margin-top:4px">Guards required: ${post.total_guards} · Shift: ${post.shift_type}</div>
          </div>
        `;

        marker.bindTooltip(tooltipContent, {
          direction: 'top',
          offset: [0, -12],
          opacity: 1,
          className: 'posts-map-tooltip',
        });

        // Click popup with action buttons
        const popupContent = document.createElement('div');
        popupContent.innerHTML = `
          <div style="min-width:200px;font-family:system-ui,sans-serif;padding:4px">
            <div style="font-weight:600;font-size:14px;margin-bottom:2px">${post.post_name}</div>
            <div style="font-size:12px;color:#666;margin-bottom:8px">${post.client_name || 'No client'}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
              <span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block"></span>
              <span style="font-size:13px;font-weight:500">${label}</span>
            </div>
            ${attSummary && attSummary.total > 0 ? `
              <div style="font-size:12px;color:#555;margin-bottom:8px;background:#f8f9fa;padding:6px 8px;border-radius:6px">
                <div>✓ Present: <strong>${attSummary.present}</strong></div>
                <div>✗ Absent: <strong>${attSummary.absent}</strong></div>
                <div>◐ Half Day: <strong>${attSummary.half_day}</strong></div>
                ${attSummary.half_vacant > 0 ? `<div>◑ Half Vacant: <strong>${attSummary.half_vacant}</strong></div>` : ''}
                ${attSummary.pending > 0 ? `<div>◌ Pending: <strong>${attSummary.pending}</strong></div>` : ''}
              </div>
            ` : '<div style="font-size:12px;color:#999;margin-bottom:8px">No attendance marked yet</div>'}
            <div style="display:flex;gap:8px">
              <button id="dir-btn-${post.id}" style="flex:1;padding:6px 10px;border-radius:6px;border:1px solid #e5e7eb;background:#fff;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;gap:4px;transition:background 0.15s" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='#fff'">
                <svg width="14" height="14" fill="none" stroke="#2563eb" stroke-width="2" viewBox="0 0 24 24"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>
                Directions
              </button>
              <button id="info-btn-${post.id}" style="flex:1;padding:6px 10px;border-radius:6px;border:1px solid #e5e7eb;background:#fff;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;gap:4px;transition:background 0.15s" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='#fff'">
                <svg width="14" height="14" fill="none" stroke="#2563eb" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                Details
              </button>
            </div>
          </div>
        `;

        const popup = L.popup({ maxWidth: 280, closeButton: true }).setContent(popupContent);
        marker.bindPopup(popup);

        // Attach click handlers after popup opens
        marker.on('popupopen', () => {
          const dirBtn = document.getElementById(`dir-btn-${post.id}`);
          const infoBtn = document.getElementById(`info-btn-${post.id}`);
          if (dirBtn) {
            dirBtn.onclick = () => handleDirections(lat, lng, post.post_name);
          }
          if (infoBtn && onViewDetails) {
            infoBtn.onclick = () => {
              map.closePopup();
              onViewDetails(post.id);
            };
          }
        });

        markersRef.current.push(marker);
      });

      // Fit bounds
      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 13);
      }
    });
  }, [posts, attendanceByPost, mapReady, handleDirections, onViewDetails]);

  return (
    <div className="h-full w-full relative">
      {isLoading ? (
        <div className="h-full flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div
            ref={containerRef}
            className="h-full w-full rounded-lg overflow-hidden"
            style={{ zIndex: 0 }}
          />
          {posts.filter(p => p.location?.latitude && p.location?.longitude).length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">No posts with location data to display</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
