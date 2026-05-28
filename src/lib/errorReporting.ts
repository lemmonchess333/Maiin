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
}

const MAX_STORED_ERRORS = 50;
const errorBuffer: ErrorReport[] = [];

/** Error types that warrant Firestore persistence */
const CRITICAL_TYPES = new Set<string>(['network', 'component']);
const CRITICAL_KEYWORDS = ['payment', 'auth', 'subscription', 'stripe', 'firestore'];

let _currentUid: string | null = null;

/** Set the current user ID for Firestore error logging */
export function setErrorReportingUid(uid: string | null): void {
  _currentUid = uid;
}

function isCritical(report: ErrorReport): boolean {
  if (CRITICAL_TYPES.has(report.type)) return true;
  const msg = report.message.toLowerCase();
  return CRITICAL_KEYWORDS.some(kw => msg.includes(kw));
}

async function persistToFirestore(report: ErrorReport): Promise<void> {
  if (!_currentUid) return;
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
