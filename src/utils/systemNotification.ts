/**
 * System Notification utility — sends browser notifications when in-app
 * toasts would be hidden behind a modal/dialog overlay.
 *
 * Handles:
 * 1. Permission request (prompts once, respects user choice)
 * 2. Modal detection via MutationObserver (reliable real-time tracking)
 * 3. Notification dispatch with appropriate icon and auto-close
 */

// ── Permission Management ─────────────────────────────────────────────────────

/**
 * Request notification permission if not already granted/denied.
 * Call this on first user interaction.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }

  if (Notification.permission !== 'default') {
    return Notification.permission;
  }

  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/**
 * Check if notification permission is granted.
 */
export function hasNotificationPermission(): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  return Notification.permission === 'granted';
}

// ── Modal State Tracking ──────────────────────────────────────────────────────

let _observerStarted = false;

/**
 * Returns whether a modal overlay is currently visible.
 * Checks the DOM directly for Radix dialog/alertdialog/sheet overlays.
 */
export function isModalOpen(): boolean {
  if (typeof document === 'undefined') return false;

  // Start observer on first call (sets body attribute for performance)
  if (!_observerStarted) {
    startModalObserver();
  }

  // Fast path: check the body attribute set by the observer
  if (document.body.hasAttribute('data-modal-open')) return true;

  // Fallback: direct DOM query
  // Radix renders role="dialog" or role="alertdialog" on the content element
  // when the dialog is open. If it exists in the DOM, the modal is open.
  const openDialog = document.querySelector(
    '[role="dialog"], [role="alertdialog"]'
  );

  return !!openDialog;
}

/**
 * MutationObserver that sets/removes a `data-modal-open` attribute on
 * document.body whenever a Radix dialog appears or disappears.
 */
function startModalObserver() {
  if (_observerStarted) return;
  if (typeof MutationObserver === 'undefined') return;
  _observerStarted = true;

  const check = () => {
    const hasDialog = document.querySelector(
      '[role="dialog"], [role="alertdialog"]'
    );
    if (hasDialog) {
      document.body.setAttribute('data-modal-open', 'true');
    } else {
      document.body.removeAttribute('data-modal-open');
    }
  };

  const observer = new MutationObserver(check);

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Initial check
  check();
}

// ── Send System Notification ──────────────────────────────────────────────────

interface SystemNotificationOptions {
  title: string;
  body?: string;
  variant?: 'default' | 'destructive' | 'success' | 'warning';
  /** Auto-close after ms (default: 5000) */
  duration?: number;
}

/**
 * Send a browser system notification.
 * Returns true if notification was sent, false if not possible.
 */
export function sendSystemNotification(options: SystemNotificationOptions): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  const { title, body, duration = 5000 } = options;

  try {
    const notification = new Notification(title, {
      body: body || undefined,
      icon: '/logo.png',
      badge: '/logo.png',
      tag: `safend-${Date.now()}`,
      requireInteraction: false,
    });

    // Auto-close
    if (duration > 0) {
      setTimeout(() => notification.close(), duration);
    }

    // Focus the app window when clicked
    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    return true;
  } catch {
    return false;
  }
}
