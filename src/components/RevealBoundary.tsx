import { Component, type ReactNode } from "react";

/**
 * A full-screen reveal that cannot load or draw shows nothing, and the
 * page goes on: `onError` closes it, so the surface coordinator frees the
 * open for the next one. Shared by the medal reveal and the league result
 * (Soc15), whose chunks load only when there is something to reveal.
 */
export default class RevealBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
