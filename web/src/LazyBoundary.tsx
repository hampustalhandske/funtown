import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Catches a render error instead of unmounting the page. A failed lazy import (a rebuilt
 * server no longer has the old chunk) says the page is out of date and offers a reload; any
 * other error says the part couldn't be shown.
 * Every caught error is also logged to the console.
 */
export class LazyBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("funtown: part of the page failed", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (!/dynamically imported module|Importing a module script failed|Loading chunk/i.test(error.message)) {
      return <p role="alert" className="error">This part of the page couldn't be shown.</p>;
    }
    return (
      <p role="alert" className="error">
        This part of the page is out of date. Reload the page.{" "}
        <button type="button" onClick={() => location.reload()}>Reload</button>
      </p>
    );
  }
}
