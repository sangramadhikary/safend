'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Camera, Shield, AlertTriangle, Bell, Download } from 'lucide-react';

interface PermissionGateProps {
  children: React.ReactNode;
}

type PermissionStatus = 'checking' | 'granted' | 'denied' | 'prompt';

/**
 * Detects if the app is running as an installed PWA (standalone mode).
 */
function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS standalone
  if ((window.navigator as any).standalone === true) return true;
  // Android/Desktop PWA
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
  return false;
}

/**
 * Detects if the device is mobile or tablet.
 */
function isMobileOrTablet(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent) || window.innerWidth < 1024;
}

/**
 * Blocks access to the supervisor portal until:
 * 1. App is installed as PWA (on mobile/tablet)
 * 2. Location, Camera, and Notification permissions are granted
 */
export function PermissionGate({ children }: PermissionGateProps) {
  const [locationStatus, setLocationStatus] = useState<PermissionStatus>('checking');
  const [cameraStatus, setCameraStatus] = useState<PermissionStatus>('checking');
  const [notificationStatus, setNotificationStatus] = useState<PermissionStatus>('checking');
  const [requesting, setRequesting] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isInstalled, setIsInstalled] = useState(true); // default true to avoid flash
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mobile = isMobileOrTablet();
    setIsMobile(mobile);

    if (mobile) {
      setIsInstalled(isStandaloneMode());
    } else {
      // Desktop — skip PWA enforcement
      setIsInstalled(true);
    }

    checkPermissions();

    // Listen for the install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (mobile && !isStandaloneMode()) {
        setShowInstallPrompt(true);
      }
    };
    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const checkPermissions = async () => {
    // Location
    if ('permissions' in navigator) {
      try {
        const loc = await navigator.permissions.query({ name: 'geolocation' });
        setLocationStatus(loc.state as PermissionStatus);
        loc.onchange = () => setLocationStatus(loc.state as PermissionStatus);
      } catch { setLocationStatus('prompt'); }
    } else { setLocationStatus('prompt'); }

    // Camera
    if ('permissions' in navigator) {
      try {
        const cam = await navigator.permissions.query({ name: 'camera' as PermissionName });
        setCameraStatus(cam.state as PermissionStatus);
        cam.onchange = () => setCameraStatus(cam.state as PermissionStatus);
      } catch { setCameraStatus('prompt'); }
    } else { setCameraStatus('prompt'); }

    // Notification
    if ('Notification' in window) {
      const perm = Notification.permission;
      setNotificationStatus(perm === 'default' ? 'prompt' : perm as PermissionStatus);
    } else {
      setNotificationStatus('granted'); // Not supported — skip
    }
  };

  const handleInstall = async () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(15);
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setShowInstallPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const requestPermissions = useCallback(async () => {
    setRequesting(true);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(15);

    // Request location
    if (locationStatus !== 'granted') {
      try {
        await new Promise<void>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            () => { setLocationStatus('granted'); resolve(); },
            (err) => { if (err.code === 1) setLocationStatus('denied'); reject(err); },
            { enableHighAccuracy: true, timeout: 10000 }
          );
        });
      } catch {}
    }

    // Request camera
    if (cameraStatus !== 'granted') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        setCameraStatus('granted');
      } catch { setCameraStatus('denied'); }
    }

    // Request notifications
    if (notificationStatus !== 'granted' && 'Notification' in window) {
      try {
        const result = await Notification.requestPermission();
        setNotificationStatus(result === 'default' ? 'prompt' : result as PermissionStatus);
      } catch { setNotificationStatus('denied'); }
    }

    setRequesting(false);
  }, [locationStatus, cameraStatus, notificationStatus]);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0B0F19]">
        <div className="w-8 h-8 border-[3px] border-gray-200 border-t-[#D71920] rounded-full animate-spin" />
      </div>
    );
  }

  // ─── Step 1: PWA Install Gate (mobile/tablet only) ───
  if (isMobile && !isInstalled) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-[#0B0F19] px-6 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="max-w-sm w-full space-y-6"
        >
          <div className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center mx-auto"
            style={{ boxShadow: '8px 8px 16px #d1d1d1, -8px -8px 16px #ffffff' }}
          >
            <img src="/icon-maskable.png" alt="Safend" className="w-16 h-16 object-contain rounded-xl" />
          </div>

          <div>
            <h1 className="text-xl font-bold">Install Safend App</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              The Supervisor Portal must be used as an installed app for the best experience and security.
            </p>
          </div>

          {deferredPrompt ? (
            <button
              onClick={handleInstall}
              className="w-full py-3.5 rounded-xl bg-[#D71920] text-white text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
            >
              <Download className="h-4 w-4" />
              Install App
            </button>
          ) : (
            <div className="space-y-3">
              <div className="p-4 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10 text-left text-sm space-y-2">
                <p className="font-medium text-gray-800 dark:text-gray-200">How to install:</p>
                {/iPhone|iPad/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '') ? (
                  <ol className="list-decimal list-inside text-xs text-gray-600 dark:text-gray-400 space-y-1">
                    <li>Tap the <strong>Share</strong> button (↑) at the bottom of Safari</li>
                    <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                    <li>Tap <strong>"Add"</strong> to install</li>
                  </ol>
                ) : (
                  <ol className="list-decimal list-inside text-xs text-gray-600 dark:text-gray-400 space-y-1">
                    <li>Tap the <strong>⋮ menu</strong> (top right) in your browser</li>
                    <li>Tap <strong>"Install app"</strong> or <strong>"Add to Home Screen"</strong></li>
                    <li>Open the app from your home screen</li>
                  </ol>
                )}
              </div>
              <p className="text-[11px] text-gray-400">
                After installing, open the app from your home screen to continue.
              </p>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  // ─── Step 2: Permission Gate ───
  const allGranted = locationStatus === 'granted' && cameraStatus === 'granted' && notificationStatus === 'granted';

  if (allGranted) {
    return <>{children}</>;
  }

  // Still checking
  if (locationStatus === 'checking' || cameraStatus === 'checking' || notificationStatus === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0B0F19]">
        <div className="w-8 h-8 border-[3px] border-gray-200 border-t-[#D71920] rounded-full animate-spin" />
      </div>
    );
  }

  const locationDenied = locationStatus === 'denied';
  const cameraDenied = cameraStatus === 'denied';
  const notifDenied = notificationStatus === 'denied';
  const anyDenied = locationDenied || cameraDenied || notifDenied;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-[#0B0F19] px-6 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="max-w-sm w-full space-y-6"
      >
        <div className="w-16 h-16 rounded-full bg-[#D71920]/10 flex items-center justify-center mx-auto">
          <Shield className="h-8 w-8 text-[#D71920]" />
        </div>

        <div>
          <h1 className="text-xl font-bold">Permissions Required</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Grant the following permissions to use the Supervisor Portal.
          </p>
        </div>

        <div className="space-y-3 text-left">
          <PermissionItem
            icon={<MapPin className="h-5 w-5" />}
            label="Location"
            description="Attendance verification & site check-ins"
            status={locationStatus}
          />
          <PermissionItem
            icon={<Camera className="h-5 w-5" />}
            label="Camera"
            description="Photo evidence & patrol documentation"
            status={cameraStatus}
          />
          <PermissionItem
            icon={<Bell className="h-5 w-5" />}
            label="Notifications"
            description="Alerts for attendance, incidents & updates"
            status={notificationStatus}
          />
        </div>

        {anyDenied && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 text-left">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Permission denied. Open your device settings → find this app → enable all permissions, then reload.
            </p>
          </div>
        )}

        {!anyDenied ? (
          <button
            onClick={requestPermissions}
            disabled={requesting}
            className="w-full py-3.5 rounded-xl bg-[#D71920] text-white text-sm font-semibold active:scale-[0.97] transition-transform disabled:opacity-60"
          >
            {requesting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Requesting...
              </span>
            ) : (
              'Allow All & Continue'
            )}
          </button>
        ) : (
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3.5 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-medium active:scale-[0.97] transition-transform"
          >
            Reload Page
          </button>
        )}

        <p className="text-[11px] text-gray-400">
          Mandatory for field operations. Your data is only used for work purposes.
        </p>
      </motion.div>
    </div>
  );
}

function PermissionItem({ icon, label, description, status }: {
  icon: React.ReactNode; label: string; description: string; status: PermissionStatus;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-white/10">
      <div className={`shrink-0 mt-0.5 ${
        status === 'granted' ? 'text-green-600' : status === 'denied' ? 'text-red-500' : 'text-gray-500'
      }`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{label}</p>
          {status === 'granted' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">✓</span>}
          {status === 'denied' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">✗</span>}
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
      </div>
    </div>
  );
}
