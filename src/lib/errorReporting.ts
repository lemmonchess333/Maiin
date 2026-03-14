/**
 * Lightweight client-side error monitoring for Tropos.
 * Captures unhandled errors and promise rejections with context.
 * Stores recent errors in memory for debugging; can be extended
 * to send to an external service.
 */

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
