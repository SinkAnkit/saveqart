import { Component } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[SaveQart] Uncaught error:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center px-4">
          <div className="w-full max-w-md card-muted p-8 text-center">
            <div className="h-14 w-14 rounded-full bg-tint-accent text-accent-hover
              flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={28} strokeWidth={2.5} />
            </div>
            <h2 className="font-display text-2xl font-bold tracking-tight mb-2">
              Something went wrong
            </h2>
            <p className="text-sm font-medium text-muted-foreground mb-6">
              An unexpected error occurred. Try refreshing or going back.
            </p>
            <button onClick={this.handleReset} className="btn-primary">
              <RefreshCw size={16} strokeWidth={2.5} /> Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
