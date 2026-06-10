/**
 * Lightweight client-side error monitoring for Tropos.
 * Captures unhandled errors and promise rejections with context.
 * Stores recent errors in memory and logs critical errors to Firestore.
 */

import { doc, collection, serverTimestamp } from 'firebase/firestore';
import { setDocGuarded } from '@/lib/firestoreWrite';
import { db } from './firebase';

export interface ErrorReport {
  message: string;
  stack?: string;
  timestamp: number;
  url: string;
  userAgent: string;
  context?: Record<string, unknown>;
  type: 'error' | 'unhandledrejection' | 'component' | 'network';
  /** App version the error occurred on — lets an operator correlate a
   *  spike to a specific deploy instead of guessing. Reads the
   *  `__APP_VERSION__` build-time define; "dev" under vitest where the
   *  define isn't injected. */
  appVersion: string;
  /** Per-page-load id so all of one session's errors group together in
   *  triage (a single crash usually emits a cascade of follow-on
   *  errors — without this they read as unrelated rows). */
  sessionId: string;
}

const MAX_STORED_ERRORS = 50;
const errorBuffer: ErrorReport[] = [];

/** Error types that warrant Firestore persistence */
const CRITICAL_TYPES = new Set<string>(['network', 'component']);
const CRITICAL_KEYWORDS = ['payment', 'auth', 'subscription', 'stripe', 'firestore'];

/** Critical reports captured BEFORE auth resolves (login / onboarding —
 *  the highest-stakes window) used to be dropped outright: persistToFirestore
 *  early-returned on a null uid. They're queued here instead and flushed
 *  once a uid arrives, so a sign-in or onboarding failure is no longer
 *  invisible. Bounded so a pre-auth error loop can't grow unboundedly. */
const MAX_PENDING_PREAUTH = 20;
const pendingPreAuth: ErrorReport[] = [];

const APP_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

/** Stable per-page-load session id. crypto.randomUUID where available
 *  (all target browsers + the Capacitor WKWebView), with a cheap
 *  fallback for non-secure / test contexts. */
const SESSION_ID = (() => {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
})();

let _currentUid: string | null = null;

/** Set the current user ID for Firestore error logging. On a real
 *  sign-in (non-null uid) this also flushes any critical reports that
 *  were captured before auth resolved. On sign-out (null) the pending
 *  pre-auth queue is dropped so a prior session's errors can't be
 *  attributed to the next account on a shared device. */
export function setErrorReportingUid(uid: string | null): void {
  _currentUid = uid;
  if (uid) {
    if (pendingPreAuth.length > 0) {
      const toFlush = pendingPreAuth.splice(0, pendingPreAuth.length);
      for (const report of toFlush) void persistToFirestore(report);
    }
  } else {
    pendingPreAuth.length = 0;
  }
}

function isCritical(report: ErrorReport): boolean {
  if (CRITICAL_TYPES.has(report.type)) return true;
  const msg = report.message.toLowerCase();
  return CRITICAL_KEYWORDS.some(kw => msg.includes(kw));
}

async function persistToFirestore(report: ErrorReport): Promise<void> {
  if (!_currentUid) {
    // No uid yet (pre-auth): queue instead of dropping, so a flush can
    // persist it once the user signs in. Bounded ring.
    pendingPreAuth.push(report);
    if (pendingPreAuth.length > MAX_PENDING_PREAUTH) {
      pendingPreAuth.splice(0, pendingPreAuth.length - MAX_PENDING_PREAUTH);
    }
    return;
  }
  try {
    const errorsCol = collection(db, 'users', _currentUid, 'errors');
    const errDoc = doc(errorsCol);
    await setDocGuarded(errDoc, {
      ...report,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Silently fail — don't create error loops
  }
}

function createReport(
  message: string,
  type: ErrorReport['type'],
  stack?: string,
  context?: Record<string, unknown>,
): ErrorReport {
  return {
    message,
    stack,
    timestamp: Date.now(),
    url: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    context,
    type,
    appVersion: APP_VERSION,
    sessionId: SESSION_ID,
  };
}

export function captureError(
  error: Error,
  type: ErrorReport['type'] = 'error',
  context?: Record<string, unknown>,
): void {
  const report = createReport(error.message, type, error.stack, context);
  errorBuffer.push(report);
  if (errorBuffer.length > MAX_STORED_ERRORS) {
    errorBuffer.splice(0, errorBuffer.length - MAX_STORED_ERRORS);
  }
  // Persist critical errors to Firestore
  if (isCritical(report)) {
    persistToFirestore(report);
  }
}

export function getRecentErrors(): readonly ErrorReport[] {
  return errorBuffer;
}

/** Test-only: number of critical reports queued while no uid was set.
 *  Lets unit tests assert pre-auth capture without a Firestore emulator
 *  (the flush itself is fire-and-forget through setDocGuarded). */
export function __getPendingPreAuthCount(): number {
  return pendingPreAuth.length;
}

export function clearErrors(): void {
  errorBuffer.length = 0;
}

export function initErrorMonitoring(): () => void {
  const handleError = (event: ErrorEvent) => {
    captureError(
      event.error instanceof Error ? event.error : new Error(event.message),
      'error',
      { filename: event.filename, lineno: event.lineno, colno: event.colno },
    );
  };

  const handleRejection = (event: PromiseRejectionEvent) => {
    const error = event.reason instanceof Error
      ? event.reason
      : new Error(String(event.reason));
    captureError(error, 'unhandledrejection');
  };

  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);

  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleRejection);
  };
}
