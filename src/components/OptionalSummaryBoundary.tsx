import { Component, type ReactNode } from "react";

/**
 * An optional panel on a finish screen (the run's and the lift's) that
 * cannot load or draw shows nothing, and the screen goes on: a failed
 * import or render must never lose the saved receipt or Done. Its lazy
 * import is made with `reloadOnChunkError: false`, so a missing chunk
 * lands here instead of reloading the page. Lazy rejects are cached, so
 * there is no Retry that could only fail again.
 */
export default class OptionalSummaryBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
