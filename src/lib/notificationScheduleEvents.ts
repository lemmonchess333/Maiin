const listeners = new Set<() => void>();

/** Re-read the actual schedule after an OS mutation settles, even if it fails. */
export function notifyNotificationScheduleChanged(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeNotificationScheduleChanges(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
