import { Component, type ReactNode } from "react";
import { captureError } from "@/lib/errorReporting";
import { ErrorState } from "@/components/ui/ErrorState";

interface Props {
  children: ReactNode;
  sectionName?: string;
}

interface State {
  hasError: boolean;
}

export class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    captureError(error, "component", {
      section: this.props.sectionName ?? "Section",
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      // Sprint 4: hand-rolled fallback replaced with the shared
      // ErrorState primitive. Same visual idiom (centred card +
      // retry) but consistent destructive-tinted icon and retry
      // delegated to the Button primitive (focus ring, 44px touch
      // target, type=button) instead of a bespoke <button> with
      // primary/10 styling.
      return (
        <ErrorState
          title="This section couldn't load."
          retry={{
            label: "Retry",
            onClick: () => this.setState({ hasError: false }),
          }}
        />
      );
    }

    return this.props.children;
  }
}
