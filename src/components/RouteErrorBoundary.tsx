import { Component, type ReactNode } from 'react';
import { THEME } from '../lib/theme';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('Route crash:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex items-center justify-center px-6 py-12" role="alert">
          <div className="text-center space-y-4 max-w-sm w-full">
            <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center"
              style={{ background: `${THEME.danger}15` }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                stroke={THEME.danger} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              {this.props.fallbackTitle || 'Something went wrong'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {this.state.error?.message || 'An unexpected error occurred on this page.'}
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-4 py-2.5 rounded-xl text-sm font-medium bg-card border border-border/50 text-foreground">
                Try again
              </button>
              <button
                onClick={() => { window.location.href = '/Maiin/'; }}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-white"
                style={{ background: THEME.teal }}>
                Go home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
