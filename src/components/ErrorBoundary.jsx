import React from 'react';

// App-level error boundary. The app is one large tree with no route-level
// isolation, so any render throw would otherwise white-screen the installed PWA
// with no way to recover. This catches it and offers a reload.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Surface for logs / future error tracking (Sentry).
    console.error('Titan crashed:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white p-6 text-center">
          <div className="text-5xl mb-4">💪</div>
          <h1 className="text-2xl font-black mb-2">Titan hit a snag</h1>
          <p className="text-gray-400 mb-6 max-w-sm">
            Something broke while rendering. Your data is safe — reload to get back in.
          </p>
          <button
            onClick={this.handleReload}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold active:scale-95 transition"
          >
            Reload Titan
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
