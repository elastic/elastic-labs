import { EuiButton, EuiCallOut, EuiSpacer, EuiText } from '@elastic/eui';

/**
 * EUI secondary error banner pattern (page remains usable).
 * @see https://eui.elastic.co/docs/patterns/error-messages/error-banners/
 */
export function ErrorBanner({ title, children, onRetry, retryLabel = 'Try again' }) {
  return (
    <>
      <EuiCallOut title={title} color="danger" iconType="warning">
        {children && <EuiText size="s">{children}</EuiText>}
        {onRetry && (
          <>
            <EuiSpacer size="s" />
            <EuiButton color="danger" size="s" onClick={onRetry}>
              {retryLabel}
            </EuiButton>
          </>
        )}
      </EuiCallOut>
      <EuiSpacer />
    </>
  );
}
