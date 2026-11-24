import { EuiCallOut, EuiLink, EuiSpacer } from '@elastic/eui';

/**
 * EUI validation errors pattern: error summary with links to fields.
 * @see https://eui.elastic.co/docs/patterns/error-messages/error-validation/
 */
export function ValidationErrorSummary({ errors, fieldLabels = {} }) {
  if (!errors?.length) return null;

  return (
    <>
      <EuiCallOut title="You must fix the following errors" color="danger" iconType="warning">
        <ul>
          {errors.map(({ field, message }) => (
            <li key={field}>
              <EuiLink href={`#${field}`}>{fieldLabels[field] || field}</EuiLink>
              {': '}
              {message}
            </li>
          ))}
        </ul>
      </EuiCallOut>
      <EuiSpacer />
    </>
  );
}
