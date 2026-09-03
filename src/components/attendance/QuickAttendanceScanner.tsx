'use client';

/**
 * Quick Attendance Scanner (public, unauthenticated client) — Requirements 1,
 * 2, 4, 5, 13.
 *
 * A thin capture-and-submit UI wired to the `showQrScanner` control on the
 * supervisor login page. It never decides eligibility: it only gathers raw
 * inputs (a `post_id` from a scanned QR, a human employee code, a front-camera
 * still, a GPS fix, and a consent timestamp) and renders the server's verdict.
 * Every trust-bearing decision lives on the server routes
 * (`/api/attendance/checkin/verify`, `/api/attendance/checkin`).
 *
 * The flow is a step machine (see design "8. Quick Attendance Scanner"):
 *
 *   scanning → permissions → enter code → select/auto shift → consent
 *            → capture → locate → submit
 *
 * Pure decision logic is reused from the tested modules under
 * `src/lib/attendance/**`:
 *   - `parseAttendanceCode`  — QR scheme classification (R1.2-1.4)
 *   - `canSubmitGps`         — the GPS submission-gate predicate (R5.2)
 *   - `decideRetry` / `computeRetryDelayMs` / `MANUAL_FALLBACK_MESSAGE`
 *                            — the network retry policy (R13.1, R13.4, R13.5)
 *
 * Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7,
 * 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.3, 13.2, 13.3, 13.4, 13.5
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Loader2,
  MapPin,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseAttendanceCode } from '@/lib/attendance/attendanceCode';
import { canSubmitGps } from '@/lib/attendance/gpsGate';
import {
  MANUAL_FALLBACK_MESSAGE,
  decideRetry,
  type AttemptOutcome,
} from '@/lib/attendance/retryPolicy';
import { SelfServiceHub } from '@/components/attendance/SelfServiceHub';
import { EmployeeLeaveForm } from '@/components/attendance/self-service/EmployeeLeaveForm';
import { EmployeeResignationForm } from '@/components/attendance/self-service/EmployeeResignationForm';
import { EmployeeSalaryAdvanceForm } from '@/components/attendance/self-service/EmployeeSalaryAdvanceForm';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** No-code-detected timeout for the scanning step, in ms (R1.5). */
const SCAN_TIMEOUT_MS = 30_000;

/** GPS fix timeout, in ms (R2.7, R5.3). */
const GPS_TIMEOUT_MS = 30_000;

/** Submission network timeout, in ms — no response within this is retryable (R13.1). */
const SUBMIT_TIMEOUT_MS = 30_000;

/** How often, in ms, we attempt to decode a frame while scanning. */
const SCAN_INTERVAL_MS = 300;

/**
 * The explicit consent notice shown before photo capture, describing what is
 * collected, how it is used, and how long it is retained (R4.1).
 */
const CONSENT_TEXT =
  'To mark your attendance we will capture a single photo of you using the ' +
  'front camera and your current GPS location. This photo and location are ' +
  'used only to verify your presence at this post and are reviewed by an ' +
  'approver. The photo is stored privately and is automatically deleted 30 ' +
  'days after your check-in is approved or rejected. By continuing you consent ' +
  'to this collection and use of your photo and location.';

type ShiftKey = 'day' | 'afternoon' | 'night';

interface Shift {
  shiftKey: ShiftKey;
  serviceTypeKey: string;
}

interface GpsFix {
  lat: number;
  lng: number;
  accuracyM: number;
}

type Step =
  | 'scanning'
  | 'code_error'
  | 'permissions'
  | 'blocked'
  | 'enter_code'
  | 'select_shift'
  | 'self_service_hub'
  | 'leave_form'
  | 'advance_form'
  | 'resignation_form'
  | 'consent'
  | 'capturing'
  | 'capture_error'
  | 'locating'
  | 'location_error'
  | 'submitting'
  | 'retrying'
  | 'success'
  | 'rejected'
  | 'manual_fallback';

type CodeErrorKind = 'malformed' | 'not_attendance' | 'timeout' | 'unsupported';
type BlockedKind = 'camera' | 'location';

export interface QuickAttendanceScannerProps {
  /** Invoked when the user dismisses the scanner. */
  onClose?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Frame decoding: native BarcodeDetector with a lazy JS fallback
// ─────────────────────────────────────────────────────────────────────────────

type FrameDecoder = (
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
) => Promise<string | null>;

/**
 * Build a QR frame decoder. Prefers the browser-native `BarcodeDetector`
 * (fast, no download); where it is unavailable (e.g. some iOS Safari builds)
 * it lazily loads a JS fallback decoder. The dynamic import is evaluated at
 * runtime via an indirect call so the bundler never tries to statically
 * resolve the optional dependency. Returns `null` when neither path works.
 */
async function createDecoder(): Promise<FrameDecoder | null> {
  const Detector = (globalThis as unknown as {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => {
      detect: (source: CanvasImageSource) => Promise<{ rawValue?: string }[]>;
    };
  }).BarcodeDetector;

  if (typeof Detector === 'function') {
    try {
      const detector = new Detector({ formats: ['qr_code'] });
      return async (video) => {
        const codes = await detector.detect(video);
        return codes && codes.length > 0 ? codes[0].rawValue ?? null : null;
      };
    } catch {
      // fall through to the JS fallback
    }
  }

  // Lazy JS fallback (loaded only when BarcodeDetector is missing). The
  // indirect `import` evades static bundler resolution so the app builds even
  // when the optional decoder package is not installed.
  try {
    const dynamicImport = new Function('m', 'return import(m)') as (
      m: string,
    ) => Promise<{ default?: unknown } & Record<string, unknown>>;
    const mod = await dynamicImport('jsqr');
    const jsQR = (mod.default ?? (mod as unknown)) as (
      data: Uint8ClampedArray,
      width: number,
      height: number,
    ) => { data: string } | null;

    if (typeof jsQR !== 'function') {
      return null;
    }

    return async (video, canvas) => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) {
        return null;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return null;
      }
      ctx.drawImage(video, 0, 0, width, height);
      const image = ctx.getImageData(0, 0, width, height);
      const result = jsQR(image.data, width, height);
      return result ? result.data : null;
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Message mapping for server verdicts
// ─────────────────────────────────────────────────────────────────────────────

/** Human message for a verify-route rejection reason (R3 outcomes). */
function verifyReasonMessage(reason: string): string {
  switch (reason) {
    case 'employee_not_found':
      return 'That employee code was not found. Check the code and try again.';
    case 'not_assigned':
      return 'You are not assigned to this post today.';
    case 'validation':
      return 'Enter a valid employee code (up to 50 characters).';
    case 'rate_limited':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'service_error':
    default:
      return 'We could not verify your deployment right now. Please try again.';
  }
}

/** Human message for a check-in service rejection reason (R13.5). */
function checkInReasonMessage(reason: string): string {
  switch (reason) {
    case 'duplicate_pending':
      return 'A check-in is already pending for this slot.';
    case 'already_present':
      return 'Attendance is already marked for this slot.';
    case 'invalid_location':
      return 'The captured location was invalid. Please retry the check-in.';
    case 'post_not_configured':
      return 'This post is not configured for attendance. Contact your Supervisor.';
    case 'photo_invalid':
      return 'The captured photo could not be accepted. Please retry.';
    case 'rate_limited':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'validation':
      return 'The submission was rejected. Please retry the check-in.';
    default:
      return 'The check-in was rejected. Please contact your Supervisor.';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function QuickAttendanceScanner({ onClose }: QuickAttendanceScannerProps) {
  const [step, setStep] = useState<Step>('scanning');

  // ── Captured / entered check-in data (retained across permission blocks) ──
  const [postId, setPostId] = useState<string>('');
  const [rawCode, setRawCode] = useState<string>('');
  const [employeeCode, setEmployeeCode] = useState<string>('');
  const [employeeName, setEmployeeName] = useState<string>('');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [consentAcceptedAt, setConsentAcceptedAt] = useState<string | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [gps, setGps] = useState<GpsFix | null>(null);

  // ── Transient UI state ──
  const [codeErrorKind, setCodeErrorKind] = useState<CodeErrorKind>('timeout');
  const [blockedKind, setBlockedKind] = useState<BlockedKind>('camera');
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [rejectionMessage, setRejectionMessage] = useState<string>('');
  const [statusNote, setStatusNote] = useState<string>('');

  // ── Media refs ──
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanDeadlineRef = useRef<number>(0);
  const decodingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Revoke the preview object URL when it changes/unmounts.
  useEffect(() => {
    return () => {
      if (photoUrl) {
        URL.revokeObjectURL(photoUrl);
      }
    };
  }, [photoUrl]);

  // ── Media lifecycle helpers ──

  const stopStream = useCallback(() => {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Stop all media when the component unmounts.
  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  const attachStream = useCallback(async (stream: MediaStream) => {
    streamRef.current = stream;

    // The video element may not be mounted the instant we get the stream (a
    // fresh `setStep` render may not have flushed yet). Wait a few frames for
    // the ref to appear before giving up.
    let video = videoRef.current;
    for (let i = 0; !video && i < 20; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      if (!mountedRef.current) return;
      video = videoRef.current;
    }
    if (!video) {
      return;
    }
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    video.muted = true;
    try {
      await video.play();
    } catch {
      // Autoplay can reject on some browsers; the frame loop still reads pixels.
    }
  }, []);

  // ── Scanning (R1.2-1.5) ──

  const beginScanning = useCallback(async () => {
    stopStream();
    setStep('scanning');
    setCodeErrorKind('timeout');
    setStatusNote('');

    if (!navigator.mediaDevices?.getUserMedia) {
      setCodeErrorKind('unsupported');
      setStep('code_error');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
    } catch {
      // Camera permission denied/unavailable at scan time — cannot read a QR.
      setBlockedKind('camera');
      setStep('blocked');
      return;
    }

    if (!mountedRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    await attachStream(stream);

    const decoder = await createDecoder();
    if (!decoder) {
      stopStream();
      setCodeErrorKind('unsupported');
      setStep('code_error');
      return;
    }

    scanDeadlineRef.current = Date.now() + SCAN_TIMEOUT_MS;
    decodingRef.current = false;

    scanTimerRef.current = setInterval(async () => {
      if (decodingRef.current) {
        return;
      }
      // No code detected within 30s (R1.5).
      if (Date.now() > scanDeadlineRef.current) {
        stopStream();
        setCodeErrorKind('timeout');
        setStep('code_error');
        return;
      }
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) {
        return;
      }
      decodingRef.current = true;
      try {
        const raw = await decoder(video, canvas);
        if (!raw) {
          return;
        }
        const parsed = parseAttendanceCode(raw);
        if (parsed.kind === 'ok') {
          stopStream();
          setPostId(parsed.postId);
          setRawCode(raw);
          setStep('permissions'); // valid post_id → request permissions (R2.1)
        } else if (parsed.kind === 'malformed') {
          stopStream();
          setCodeErrorKind('malformed'); // R1.3
          setStep('code_error');
        } else {
          stopStream();
          setCodeErrorKind('not_attendance'); // R1.4
          setStep('code_error');
        }
      } catch {
        // transient decode failure — keep scanning until the deadline
      } finally {
        decodingRef.current = false;
      }
    }, SCAN_INTERVAL_MS);
  }, [attachStream, stopStream]);

  // Kick off scanning on first mount.
  useEffect(() => {
    void beginScanning();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Permissions (R2.1, R2.5, R2.6, R2.7) ──

  const requestPermissions = useCallback(async () => {
    setStep('permissions');
    setStatusNote('Requesting location and notification access…');

    // Notification permission is best-effort and never blocks the flow (R2.5).
    try {
      if (typeof Notification !== 'undefined' && Notification.requestPermission) {
        void Notification.requestPermission();
      }
    } catch {
      // ignore — notifications are optional
    }

    // Precise location permission (R2.1). We only probe the grant here; the
    // actual fix is captured at the locating step (R2.7, R5.3).
    if (!navigator.geolocation) {
      setBlockedKind('location');
      setStep('blocked');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        if (!mountedRef.current) return;
        // Camera was granted at scan time and location is now granted (R2.6).
        setStep('enter_code');
      },
      (err) => {
        if (!mountedRef.current) return;
        if (err.code === err.PERMISSION_DENIED) {
          setBlockedKind('location'); // R2.3
          setStep('blocked');
        } else {
          // Permission granted but no immediate fix (timeout/unavailable). The
          // grant is what matters here; the real fix is taken later (R2.7).
          setStep('enter_code');
        }
      },
      { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: 0 },
    );
  }, []);

  // Enter the permissions step automatically once a valid post_id is scanned.
  useEffect(() => {
    if (step === 'permissions' && !statusNote) {
      void requestPermissions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Verify deployment (R3 client side) ──

  const handleVerify = useCallback(async () => {
    const code = employeeCode.trim();
    if (!code) {
      setVerifyError('Enter your employee code.');
      return;
    }
    if (code.length > 50) {
      setVerifyError('Employee code is too long.');
      return;
    }

    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await fetch('/api/attendance/checkin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, employee_code: code, raw_code: rawCode || undefined }),
      });
      const data = await res.json().catch(() => null);

      if (data && data.ok === true && Array.isArray(data.shifts) && data.shifts.length > 0) {
        const parsedShifts: Shift[] = data.shifts.map((s: any) => ({
          shiftKey: s.shiftKey as ShiftKey,
          serviceTypeKey: String(s.serviceTypeKey),
        }));
        setShifts(parsedShifts);
        // Store employee name from verification response for the hub display.
        if (data.employeeName) {
          setEmployeeName(String(data.employeeName));
        }
        if (parsedShifts.length === 1 || data.autoSelect === true) {
          // Exactly one deployment — auto-select, no shift prompt (R3.6).
          setSelectedShift(parsedShifts[0]);
          setStep('self_service_hub');
        } else {
          // More than one — the user must choose exactly one (R3.7).
          setStep('select_shift');
        }
        return;
      }

      const reason = data && typeof data.reason === 'string' ? data.reason : 'service_error';
      setVerifyError(verifyReasonMessage(reason));
    } catch {
      setVerifyError('Network problem. Check your connection and try again.');
    } finally {
      setVerifying(false);
    }
  }, [employeeCode, postId]);

  // ── Consent → capture (R4) ──

  const acceptConsent = useCallback(() => {
    // Record the acceptance timestamp in ISO 8601 UTC (R4.4).
    setConsentAcceptedAt(new Date().toISOString());
    setStep('capturing');
  }, []);

  const declineConsent = useCallback(() => {
    // Abort capture, discard any location gathered, return to the step before
    // capture (R4.5).
    setGps(null);
    setConsentAcceptedAt(null);
    setStep(shifts.length > 1 ? 'select_shift' : 'enter_code');
  }, [shifts.length]);

  // Capture exactly one still from the FRONT camera, no audio/video recording
  // (R2.4, R4.3, R4.6).
  const capturePhoto = useCallback(async () => {
    stopStream();

    if (!navigator.mediaDevices?.getUserMedia) {
      setStep('capture_error'); // retains consent timestamp (R4.6)
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
    } catch {
      setStep('capture_error'); // camera unavailable/denied at capture (R4.6)
      return;
    }

    if (!mountedRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    await attachStream(stream);

    // Give the sensor a brief moment to expose, then grab a single frame.
    await new Promise((resolve) => setTimeout(resolve, 400));

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      stopStream();
      setStep('capture_error');
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      stopStream();
      setStep('capture_error');
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9);
    });

    stopStream();

    if (!blob) {
      setStep('capture_error');
      return;
    }

    setPhotoBlob(blob);
    if (photoUrl) {
      URL.revokeObjectURL(photoUrl);
    }
    setPhotoUrl(URL.createObjectURL(blob));
    setStep('locating');
  }, [attachStream, photoUrl, stopStream]);

  // Run capture when we enter the capturing step.
  useEffect(() => {
    if (step === 'capturing') {
      void capturePhoto();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Locate (R5) ──

  const captureLocation = useCallback(() => {
    setStep('locating');
    setStatusNote('Getting your location…');

    if (!navigator.geolocation) {
      setStep('location_error');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!mountedRef.current) return;
        const fix: GpsFix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        };
        // Only proceed when the fix passes the submission gate (R5.2).
        if (canSubmitGps(fix)) {
          setGps(fix);
          setStep('submitting');
        } else {
          setStep('location_error'); // invalid fix — allow retry (R5.3)
        }
      },
      () => {
        if (!mountedRef.current) return;
        setStep('location_error'); // no fix within 30s — allow retry (R2.7, R5.3)
      },
      { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: 0 },
    );
  }, []);

  // Kick off location capture right after the photo is captured.
  useEffect(() => {
    if (step === 'locating' && !statusNote) {
      captureLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Submit with retry policy (R13) ──

  /** Perform a single submission attempt and classify its outcome (R13). */
  const attemptSubmit = useCallback(async (): Promise<AttemptOutcome> => {
    if (!photoBlob || !gps || !selectedShift || !consentAcceptedAt) {
      // Should not happen given the gating; treat as terminal validation.
      return { kind: 'rejection', reason: 'validation' };
    }

    // Offline device → retryable network condition (R13.1).
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { kind: 'network' };
    }

    const form = new FormData();
    form.append('post_id', postId);
    form.append('employee_code', employeeCode.trim());
    form.append('shift_key', selectedShift.shiftKey);
    form.append('service_type_key', selectedShift.serviceTypeKey);
    form.append('gps_lat', String(gps.lat));
    form.append('gps_lng', String(gps.lng));
    form.append('gps_accuracy_m', String(gps.accuracyM));
    form.append('consent_accepted_at', consentAcceptedAt);
    form.append('photo', photoBlob, 'attendance.jpg');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);

    try {
      const res = await fetch('/api/attendance/checkin', {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });

      if (res.ok) {
        return { kind: 'success' };
      }

      // A service rejection is terminal — surface its reason, never retry (R13.5).
      const data = await res.json().catch(() => null);
      const reason = data && typeof data.reason === 'string' ? data.reason : 'validation';
      return { kind: 'rejection', reason };
    } catch {
      // Aborted timeout or transport failure → retryable network condition (R13.1).
      return { kind: 'network' };
    } finally {
      clearTimeout(timeout);
    }
  }, [consentAcceptedAt, employeeCode, gps, photoBlob, postId, selectedShift]);

  /** Drive the submission through the retry policy (R13.1, R13.3-13.5). */
  const runSubmission = useCallback(async () => {
    setStatusNote('');
    let retriesUsed = 0;

    for (;;) {
      if (!mountedRef.current) return;
      const outcome = await attemptSubmit();
      const decision = decideRetry(outcome, retriesUsed);

      if (decision.action === 'confirm') {
        if (mountedRef.current) setStep('success'); // R13.3
        return;
      }
      if (decision.action === 'reject') {
        if (mountedRef.current) {
          setRejectionMessage(checkInReasonMessage(decision.reason)); // R13.5
          setStep('rejected');
        }
        return;
      }
      if (decision.action === 'manual_fallback') {
        if (mountedRef.current) setStep('manual_fallback'); // R13.4
        return;
      }

      // Retryable: wait the policy-provided delay then retry (R13.1, R13.2).
      retriesUsed = decision.retryNumber;
      if (mountedRef.current) {
        setStep('retrying');
      }
      await new Promise((resolve) => setTimeout(resolve, decision.delayMs));
      if (!mountedRef.current) return;
      setStep('submitting');
    }
  }, [attemptSubmit]);

  // Start (and only start once) the submission when entering the submitting
  // step with a full payload.
  const submissionStartedRef = useRef(false);
  useEffect(() => {
    if (step === 'submitting' && !submissionStartedRef.current) {
      submissionStartedRef.current = true;
      void runSubmission();
    }
    if (step !== 'submitting' && step !== 'retrying') {
      submissionStartedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Reset for a fresh check-in ──
  const resetAll = useCallback(() => {
    stopStream();
    setPostId('');
    setRawCode('');
    setEmployeeCode('');
    setEmployeeName('');
    setShifts([]);
    setSelectedShift(null);
    setConsentAcceptedAt(null);
    setPhotoBlob(null);
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(null);
    setGps(null);
    setVerifyError(null);
    setRejectionMessage('');
    setStatusNote('');
    submissionStartedRef.current = false;
    void beginScanning();
  }, [beginScanning, photoUrl, stopStream]);

  const handleClose = useCallback(() => {
    stopStream();
    onClose?.();
  }, [onClose, stopStream]);

  return (
    <div className="fixed inset-0 z-9999 flex flex-col overflow-y-auto overflow-x-hidden bg-safend-ink/95 backdrop-blur-xs">
      <div className="mx-auto box-border flex w-full max-w-md flex-1 flex-col px-4 py-5">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <ScanLine className="h-5 w-5 text-safend-red" />
            <span className="font-heading text-[15px] font-semibold">Quick Attendance</span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close scanner"
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Hidden canvas used for frame decode + still capture */}
        <canvas ref={canvasRef} className="hidden" />

        <div className="flex-1">{renderStep()}</div>
      </div>
    </div>
  );

  // ── Step rendering ──
  function renderStep() {
    switch (step) {
      case 'scanning':
        return (
          <div className="flex flex-col items-center">
            <div className="relative aspect-square w-full max-w-full overflow-hidden rounded-[16px] border border-white/10 bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-2/3 w-2/3 rounded-[14px] border-2 border-safend-red/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                {/* Animated scan line */}
                <div className="absolute left-[16.67%] right-[16.67%] h-[2px] bg-linear-to-r from-transparent via-safend-red to-transparent animate-[scanLine_2.5s_ease-in-out_infinite]" />
              </div>
              {/* Corner markers for visual polish */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-2/3 w-2/3">
                  <span className="absolute top-0 left-0 h-5 w-5 border-t-[3px] border-l-[3px] border-safend-red rounded-tl-[6px]" />
                  <span className="absolute top-0 right-0 h-5 w-5 border-t-[3px] border-r-[3px] border-safend-red rounded-tr-[6px]" />
                  <span className="absolute bottom-0 left-0 h-5 w-5 border-b-[3px] border-l-[3px] border-safend-red rounded-bl-[6px]" />
                  <span className="absolute bottom-0 right-0 h-5 w-5 border-b-[3px] border-r-[3px] border-safend-red rounded-br-[6px]" />
                </div>
              </div>
            </div>
            <p className="mt-4 text-center text-[13px] font-body text-white/70">
              Point your camera at the attendance QR code posted at your site.
            </p>
          </div>
        );

      case 'code_error':
        return (
          <StatusPanel
            tone="error"
            icon={<AlertCircle className="h-7 w-7" />}
            title={
              codeErrorKind === 'malformed'
                ? 'Attendance code is malformed'
                : codeErrorKind === 'not_attendance'
                  ? 'Not an attendance code'
                  : codeErrorKind === 'unsupported'
                    ? 'Scanning not supported'
                    : 'No code detected'
            }
            message={
              codeErrorKind === 'malformed'
                ? 'This QR code uses the attendance format but its post identifier is invalid. Ask your Supervisor for a valid code, then rescan.'
                : codeErrorKind === 'not_attendance'
                  ? 'This is not an attendance QR code. Scan the code posted at your site.'
                  : codeErrorKind === 'unsupported'
                    ? 'This browser cannot scan QR codes. Try updating your browser or use a different device.'
                    : 'No QR code was detected. Move closer to the code and rescan.'
            }
          >
            <Button onClick={() => void beginScanning()} className="w-full" >
              <RefreshCw className="mr-2 h-4 w-4" /> Rescan
            </Button>
          </StatusPanel>
        );

      case 'permissions':
        return (
          <StatusPanel
            tone="info"
            icon={<ShieldCheck className="h-7 w-7" />}
            title="Requesting permissions"
            message="Please allow camera, location, and notification access so we can capture your attendance."
          >
            <div className="flex items-center justify-center gap-2 text-white/70">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-[13px]">{statusNote || 'Waiting for permissions…'}</span>
            </div>
          </StatusPanel>
        );

      case 'blocked':
        return (
          <StatusPanel
            tone="error"
            icon={blockedKind === 'camera' ? <Camera className="h-7 w-7" /> : <MapPin className="h-7 w-7" />}
            title={blockedKind === 'camera' ? 'Camera access required' : 'Location access required'}
            message={
              blockedKind === 'camera'
                ? 'Camera access is required to scan the code and capture your photo. Enable it in your browser settings, then try again.'
                : 'Precise location access is required to confirm you are at the post. Enable it in your browser settings, then try again.'
            }
          >
            <Button
              onClick={() =>
                blockedKind === 'camera' ? void beginScanning() : void requestPermissions()
              }
              className="w-full"
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Try again
            </Button>
          </StatusPanel>
        );

      case 'enter_code':
        return (
          <div className="rounded-[16px] border border-white/10 bg-white/4 p-5">
            <h2 className="mb-1 font-heading text-[16px] font-semibold text-white">Enter your employee code</h2>
            <p className="mb-4 text-[13px] font-body text-white/60">
              We will confirm your deployment to this post for today.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="att-employee-code" className="text-[12px] font-medium text-white/70">
                Employee code
              </Label>
              <Input
                id="att-employee-code"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !verifying && void handleVerify()}
                placeholder="e.g. EMP001"
                maxLength={50}
                autoFocus
                disabled={verifying}
                className="h-[46px] rounded-[10px] border-white/10 bg-white/[0.07] text-white placeholder:text-white/30"
              />
            </div>

            {verifyError && (
              <div className="mt-3 flex items-start gap-2 rounded-[10px] border border-red-500/20 bg-red-500/10 p-3 text-[13px] text-red-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{verifyError}</span>
              </div>
            )}

            <Button
              onClick={() => void handleVerify()}
              disabled={verifying || employeeCode.trim().length === 0}
              className="mt-4 w-full"
            >
              {verifying ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
                </span>
              ) : (
                'Continue'
              )}
            </Button>
          </div>
        );

      case 'select_shift':
        return (
          <div className="rounded-[16px] border border-white/10 bg-white/4 p-5">
            <h2 className="mb-1 font-heading text-[16px] font-semibold text-white">Select your shift</h2>
            <p className="mb-4 text-[13px] font-body text-white/60">
              You have more than one deployment at this post today. Choose the shift you are checking in for.
            </p>
            <div className="space-y-2">
              {shifts.map((s) => (
                <button
                  key={`${s.shiftKey}:${s.serviceTypeKey}`}
                  type="button"
                  onClick={() => {
                    setSelectedShift(s);
                    setStep('self_service_hub');
                  }}
                  className="flex w-full items-center justify-between rounded-[10px] border border-white/10 bg-white/6 p-4 text-left text-white transition-colors hover:border-safend-red/40 hover:bg-safend-red/8"
                >
                  <span className="font-heading text-[14px] font-semibold capitalize">{s.shiftKey}</span>
                  <span className="text-[12px] text-white/50">{s.serviceTypeKey}</span>
                </button>
              ))}
            </div>
          </div>
        );

      case 'self_service_hub':
        return (
          <SelfServiceHub
            employeeCode={employeeCode.trim()}
            employeeName={employeeName || employeeCode.trim()}
            postId={postId}
            shiftKey={selectedShift?.shiftKey ?? 'day'}
            serviceTypeKey={selectedShift?.serviceTypeKey ?? ''}
            onSelectAttendance={() => setStep('consent')}
            onSelectLeave={() => setStep('leave_form')}
            onSelectAdvance={() => setStep('advance_form')}
            onSelectResignation={() => setStep('resignation_form')}
            onBack={resetAll}
            onClose={handleClose}
          />
        );

      case 'leave_form':
        return (
          <EmployeeLeaveForm
            employeeCode={employeeCode.trim()}
            employeeName={employeeName || employeeCode.trim()}
            postId={postId}
            onBack={() => setStep('self_service_hub')}
            onClose={handleClose}
          />
        );

      case 'advance_form':
        return (
          <EmployeeSalaryAdvanceForm
            employeeCode={employeeCode.trim()}
            employeeName={employeeName || employeeCode.trim()}
            postId={postId}
            onBack={() => setStep('self_service_hub')}
            onClose={handleClose}
          />
        );

      case 'resignation_form':
        return (
          <EmployeeResignationForm
            employeeCode={employeeCode.trim()}
            employeeName={employeeName || employeeCode.trim()}
            postId={postId}
            onBack={() => setStep('self_service_hub')}
            onClose={handleClose}
          />
        );

      case 'consent':
        return (
          <div className="rounded-[16px] border border-white/10 bg-white/4 p-5">
            <div className="mb-3 flex items-center gap-2 text-white">
              <ShieldCheck className="h-5 w-5 text-safend-red" />
              <h2 className="font-heading text-[16px] font-semibold">Consent to capture</h2>
            </div>
            <p className="mb-5 text-[13px] font-body leading-[1.6] text-white/75">{CONSENT_TEXT}</p>
            <div className="space-y-2">
              <Button onClick={acceptConsent} className="w-full">
                I agree — capture my photo
              </Button>
              <button
                type="button"
                onClick={declineConsent}
                className="w-full rounded-[10px] py-2.5 text-[13px] font-medium text-white/60 transition-colors hover:text-white"
              >
                Decline
              </button>
            </div>
          </div>
        );

      case 'capturing':
        return (
          <div className="flex flex-col items-center">
            <div className="relative aspect-square w-full overflow-hidden rounded-[16px] border border-white/10 bg-black">
              <video ref={videoRef} playsInline muted className="h-full w-full scale-x-[-1] object-cover" />
            </div>
            <div className="mt-4 flex items-center gap-2 text-white/70">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-[13px]">Capturing your photo…</span>
            </div>
          </div>
        );

      case 'capture_error':
        return (
          <StatusPanel
            tone="error"
            icon={<Camera className="h-7 w-7" />}
            title="Camera could not be accessed"
            message="We could not capture your photo. Check camera access and try again. Your consent has been recorded."
          >
            <Button onClick={() => setStep('capturing')} className="w-full">
              <RefreshCw className="mr-2 h-4 w-4" /> Retry capture
            </Button>
          </StatusPanel>
        );

      case 'locating':
        return (
          <StatusPanel
            tone="info"
            icon={<MapPin className="h-7 w-7" />}
            title="Getting your location"
            message="Hold still while we confirm your GPS position."
          >
            <div className="flex items-center justify-center gap-2 text-white/70">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-[13px]">Locating…</span>
            </div>
          </StatusPanel>
        );

      case 'location_error':
        return (
          <StatusPanel
            tone="error"
            icon={<MapPin className="h-7 w-7" />}
            title="Location could not be obtained"
            message="We could not get a precise location fix. Move to an open area and retry."
          >
            <Button onClick={captureLocation} className="w-full">
              <RefreshCw className="mr-2 h-4 w-4" /> Retry location
            </Button>
          </StatusPanel>
        );

      case 'submitting':
        return (
          <StatusPanel
            tone="info"
            icon={<Loader2 className="h-7 w-7 animate-spin" />}
            title="Submitting your check-in"
            message="Sending your photo and location for approval."
          >
            {photoUrl && (
              <img
                src={photoUrl}
                alt="Captured attendance"
                className="mx-auto h-28 w-28 scale-x-[-1] rounded-[12px] object-cover"
              />
            )}
          </StatusPanel>
        );

      case 'retrying':
        return (
          <StatusPanel
            tone="info"
            icon={<RefreshCw className="h-7 w-7 animate-spin" />}
            title="Retrying submission"
            message="Your connection dropped. We are retrying automatically — please keep this screen open."
          />
        );

      case 'success':
        return (
          <StatusPanel
            tone="success"
            icon={<CheckCircle2 className="h-7 w-7" />}
            title="Check-in submitted"
            message="Your check-in is pending approval. Your Supervisor or Area Officer will review it shortly."
          >
            <Button onClick={handleClose} className="w-full">
              Done
            </Button>
          </StatusPanel>
        );

      case 'rejected':
        return (
          <StatusPanel
            tone="error"
            icon={<AlertCircle className="h-7 w-7" />}
            title="Check-in not accepted"
            message={rejectionMessage}
          >
            <div className="w-full space-y-2">
              <Button onClick={resetAll} className="w-full">
                <RefreshCw className="mr-2 h-4 w-4" /> Start over
              </Button>
              <button
                type="button"
                onClick={handleClose}
                className="w-full rounded-[10px] py-2.5 text-[13px] font-medium text-white/60 transition-colors hover:text-white"
              >
                Close
              </button>
            </div>
          </StatusPanel>
        );

      case 'manual_fallback':
        return (
          <StatusPanel
            tone="error"
            icon={<AlertCircle className="h-7 w-7" />}
            title="Could not submit"
            message={MANUAL_FALLBACK_MESSAGE}
          >
            <Button onClick={handleClose} className="w-full">
              Close
            </Button>
          </StatusPanel>
        );

      default:
        return null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Presentational helper
// ─────────────────────────────────────────────────────────────────────────────

interface StatusPanelProps {
  tone: 'info' | 'success' | 'error';
  icon: React.ReactNode;
  title: string;
  message: string;
  children?: React.ReactNode;
}

function StatusPanel({ tone, icon, title, message, children }: StatusPanelProps) {
  const toneClasses =
    tone === 'success'
      ? 'bg-green-500/10 border-green-500/20 text-green-300'
      : tone === 'error'
        ? 'bg-red-500/10 border-red-500/20 text-red-300'
        : 'bg-white/6 border-white/10 text-safend-red';

  return (
    <div className="flex flex-col items-center rounded-[16px] border border-white/10 bg-white/4 p-6 text-center">
      <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full border ${toneClasses}`}>
        {icon}
      </div>
      <h2 className="mb-2 font-heading text-[16px] font-semibold text-white">{title}</h2>
      <p className="mb-5 max-w-full text-[13px] font-body leading-[1.6] text-white/70">{message}</p>
      {children && <div className="w-full">{children}</div>}
    </div>
  );
}

export default QuickAttendanceScanner;
