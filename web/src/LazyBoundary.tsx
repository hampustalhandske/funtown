import { Component, type ReactNode } from "react";

/** Catches a failed lazy import (a rebuilt server no longer has the old chunk) and offers a reload instead of unmounting the page. */
export class LazyBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
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
