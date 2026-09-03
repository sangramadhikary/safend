'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Post } from '@/types/operations';
import { buildGoogleTileLayer, preloadGoogleMaps } from '@/lib/googleMaps';

// Pre-warm the Google Maps JS API as early as module load.
preloadGoogleMaps();

interface MapboxMapProps {
  posts: Post[];
  config?: Record<string, any>;
  onPostSelect?: (postId: string) => void;
}

export default function MapboxMap({ posts, config, onPostSelect }: MapboxMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Cleanup previous instance
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    let cancelled = false;

    (async () => {
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current).setView([20.5937, 78.9629], 5);
      mapRef.current = map;

      // Official Google Map Tiles API — keyed, billed, ToS-compliant.
      const tileLayer = await buildGoogleTileLayer('roadmap');
      if (cancelled) { map.remove(); mapRef.current = null; return; }
      tileLayer.addTo(map);

      if (!posts.length) return;

      // Status colours
      const getColor = (status: string) => {
        switch (status) {
          case 'active':    return '#16A34A';
          case 'inactive':  return '#9CA3AF';
          case 'completed': return '#2563EB';
          default:          return '#D71920';
        }
      };

      const markers: L.LatLng[] = [];

      posts.forEach((post) => {
        if (!post.location?.latitude || !post.location?.longitude) return;

        const latlng: L.LatLngExpression = [post.location.latitude, post.location.longitude];
        markers.push(L.latLng(post.location.latitude, post.location.longitude));

        const marker = L.circleMarker(latlng, {
          radius: 8,
          color: '#ffffff',
          weight: 2,
          fillColor: getColor(post.status),
          fillOpacity: 1,
        }).addTo(map);

        // Popup
        marker.bindPopup(`
          <div style="padding:4px">
            <strong>${post.name}</strong><br/>
            <span style="font-size:12px;color:#666">Client: ${post.clientName}</span><br/>
            <span style="font-size:12px;color:#666">Status: ${post.status}</span>
            ${onPostSelect ? '<br/><span style="font-size:11px;color:#2563EB;cursor:pointer">Click to view details</span>' : ''}
          </div>
        `);

        if (onPostSelect) {
          marker.on('click', () => onPostSelect(post.id));
        }

        // Label
        if (config?.showLabels !== false) {
          L.tooltip({
            permanent: true,
            direction: 'top',
            offset: [0, -12],
            className: 'leaflet-post-label',
          })
            .setLatLng(latlng)
            .setContent(`<span style="font-size:11px;font-weight:500">${post.name}</span>`)
            .addTo(map);
        }
      });

      // Fit bounds
      if (markers.length > 1) {
        map.fitBounds(L.latLngBounds(markers), { padding: [40, 40], maxZoom: 14 });
      } else if (markers.length === 1) {
        map.setView(markers[0], 13);
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [posts, config, onPostSelect]);

  return (
    <div className="relative h-full">
      <div ref={containerRef} className="h-full rounded-md" />
      {posts.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-70 rounded-md">
          <span className="text-sm text-muted-foreground">No posts to display on map</span>
        </div>
      )}
    </div>
  );
}
