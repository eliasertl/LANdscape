import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ArrowClockwise, Copy, WarningOctagon } from '@phosphor-icons/react';
import { Button } from './Button';
import { copyText } from './Clipboard';
import { toast } from './Toast';
import styles from './ErrorBoundary.module.css';

interface ErrorBoundaryProps {
  /** What is inside, for the card and the copied details ("Clock widget", "Files window"). */
  label: string;
  children: ReactNode;
  /** Smaller card for tight places (taskbar and tray items). */
  compact?: boolean;
  /** Wraps the error card, e.g. in the widget's frame so it keeps its place on the desktop. */
  frame?: (card: ReactNode) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string;
  /** Incremented by "Reload" so the subtree mounts fresh. */
  generation: number;
}

/** Recent failures, newest last; included in "Copy details" to help fix things quickly. */
const recentErrors: string[] = [];

/**
 * Keeps one broken part from taking the desktop down: a window, widget,
 * taskbar item, startup animation or app frame that throws while rendering
 * shows a small card instead. "Reload" mounts it again, "Copy details" puts
 * everything needed for a bug report on the clipboard.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, componentStack: '', generation: 0 };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? '' });
    recentErrors.push(`${new Date().toISOString()} ${this.props.label}: ${error.message}`);
    if (recentErrors.length > 10) recentErrors.shift();
    console.error(`[LANdscape] ${this.props.label} crashed`, error);
  }

  private reload = () => {
    this.setState((s) => ({ error: null, componentStack: '', generation: s.generation + 1 }));
  };

  private copy = () => {
    const { error, componentStack } = this.state;
    const details = [
      `LANdscape: ${this.props.label} crashed`,
      `Time: ${new Date().toISOString()}`,
      `Page: ${location.pathname}${location.search}`,
      `Browser: ${navigator.userAgent}`,
      '',
      `${error?.name ?? 'Error'}: ${error?.message ?? ''}`,
      error?.stack ?? '',
      '',
      'Component stack:',
      componentStack.trim(),
      '',
      'Recent failures:',
      ...recentErrors,
    ].join('\n');
    void copyText(details).then((ok) => (ok ? toast.success('Error details copied.') : toast.error('Could not copy. Open the browser console for the details.')));
  };

  override render(): ReactNode {
    const { error, generation } = this.state;
    if (!error) return <ErrorBoundaryContent key={generation}>{this.props.children}</ErrorBoundaryContent>;
    const { label, compact } = this.props;
    if (compact) {
      return (
        <button type="button" className={styles.compact} title={`${label} stopped working: ${error.message}. Click to reload.`} onClick={this.reload} data-error-boundary={label}>
          <WarningOctagon weight="fill" />
        </button>
      );
    }
    const card = (
      <div className={styles.card} role="alert" data-error-boundary={label}>
        <WarningOctagon weight="fill" className={styles.icon} />
        <div className={styles.text}>
          <strong className="text-callout emphasized">{label} stopped working</strong>
          <span className={`${styles.message} text-footnote text-secondary`}>{error.message || 'Unknown error'}</span>
        </div>
        <div className={styles.actions}>
          <Button size="small" icon={<ArrowClockwise />} onClick={this.reload}>
            Reload
          </Button>
          <Button size="small" variant="plain" icon={<Copy />} onClick={this.copy}>
            Copy details
          </Button>
        </div>
      </div>
    );
    return this.props.frame ? this.props.frame(card) : card;
  }
}

/** Fragment wrapper so a new `key` remounts the children on reload. */
function ErrorBoundaryContent({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
