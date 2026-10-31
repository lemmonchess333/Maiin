import { ErrorState } from "@/components/ui/ErrorState";

/**
 * The loading screen's word when the last account's Watch run could not be
 * cleared from this iPhone (AuthProvider holds the next account back until
 * it is). Loaded only then, so the first chunk carries none of it.
 */
export default function WatchAccountCleanupError({
  onRetry,
}: {
  onRetry: () => void;
}) {
  return (
    <div className="w-full max-w-sm px-4">
      <ErrorState
        title="Couldn't clear Watch runs"
        description="Tropos clears the last account's Watch run from this iPhone before opening another, and that didn't finish."
        retry={{ onClick: onRetry }}
      />
    </div>
  );
}
