import { Component } from "react";

/**
 * Catches render-time errors in the subtree and shows a fallback UI.
 * Wrap each page route in App.jsx:
 *   <ErrorBoundary><SupplyChainPage /></ErrorBoundary>
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(err) {
    return { hasError: true, message: err?.message ?? "Unexpected error" };
  }

  componentDidCatch(err, info) {
    console.error("[ErrorBoundary]", err, info?.componentStack);
  }

  reset() {
    this.setState({ hasError: false, message: "" });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 p-8 text-center">
        <div className="w-10 h-10 rounded-full bg-danger-light flex items-center justify-center text-danger text-lg font-bold">!</div>
        <div>
          <p className="text-sm font-semibold text-text mb-1">Something went wrong</p>
          <p className="text-xs text-muted max-w-sm">{this.state.message}</p>
        </div>
        <button
          onClick={() => this.reset()}
          className="px-4 py-1.5 text-xs font-medium bg-accent text-white rounded hover:bg-accent-hover transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }
}
