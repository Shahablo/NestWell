import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

/** Keeps a screen error from blanking the whole demo (NFR-03). The banner and role switcher stay usable. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Screen error', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <h1>This screen hit an error</h1>
          <p className="muted">The rest of the demo still works. Use the role switcher above, or open the admin panel to reset the scenario.</p>
          <pre className="json-block">{String(this.state.error.stack ?? this.state.error.message)}</pre>
          <p>
            <button type="button" className="btn btn--secondary" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
