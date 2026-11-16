import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Catches a failed lazy import (a rebuilt server no longer has the old chunk) and offers a
 * reload instead of unmounting the page. Any error it catches is also logged to the console.
 */
export class LazyBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("funtown: part of the page failed", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <p role="alert" className="error">
        This part of the page is out of date. Reload the page.{" "}
        <button type="button" onClick={() => location.reload()}>Reload</button>
      </p>
    );
  }
}
