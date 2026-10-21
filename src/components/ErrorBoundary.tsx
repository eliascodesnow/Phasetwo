import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; resetKey?: string; fullPage?: boolean };
type State = { failed: boolean };

/** Keeps one broken screen from blanking the whole app, and offers a way out. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("PhaseTwo screen failed to load", error, info.componentStack);
  }

  componentDidUpdate(previous: Props): void {
    // Moving to another screen clears the error so the rest of the app stays usable.
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className={`mx-auto flex max-w-md flex-col items-center gap-3 px-6 text-center ${this.props.fullPage ? "min-h-screen justify-center" : "py-12"}`}>
        <h2 className="font-display text-xl font-semibold text-zinc-900">This screen did not load</h2>
        <p className="text-sm leading-6 text-zinc-600">Your data is safe. This usually happens on a weak connection or right after an update.</p>
        <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-full bg-sage-dark px-6 text-sm font-semibold text-white hover:bg-sage-darker">Reload</button>
      </div>
    );
  }
}
