import { Component } from 'react'
import Alert from './ui/Alert'
import Button from './ui/Button'

// Catches JavaScript errors while a page renders. Without this, one crashing
// component would leave the WHOLE app blank. React only supports this as a class.
// Give it a `key` (e.g. the current path) so it resets when the user navigates away.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Logged in the browser console for debugging; nothing sensitive is sent anywhere.
    console.error('Page crashed:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto max-w-xl py-12">
        <Alert tone="danger" title="This page ran into a problem">
          <p>Something went wrong while showing this page. Your money and data are safe – nothing was changed.</p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
              Reload page
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.location.assign('/dashboard')}>
              Go to dashboard
            </Button>
          </div>
        </Alert>
      </div>
    )
  }
}
