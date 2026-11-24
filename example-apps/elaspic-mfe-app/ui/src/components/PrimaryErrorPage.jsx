import {
  EuiButton,
  EuiButtonEmpty,
  EuiEmptyPrompt,
  EuiPageTemplate,
} from '@elastic/eui';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

/**
 * EUI primary error page pattern (page cannot be shown).
 * @see https://eui.elastic.co/docs/patterns/error-messages/error-page/
 */
const ERROR_PRESETS = {
  403: {
    iconType: 'lock',
    title: "You can't access this page",
    body: 'You do not have permission to view this page. If you think this is a mistake, sign in with a different account.',
  },
  404: {
    iconType: 'search',
    title: "We can't find the page you're looking for",
    body: 'If you typed the URL, check that it is correct. You can go back or return home.',
  },
  410: {
    iconType: 'trash',
    title: 'This page has been permanently deleted',
    body: 'This resource is no longer available. You can go back or return home.',
  },
};

export function PrimaryErrorPage({ code = 404, title, body }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const preset = ERROR_PRESETS[code] ?? ERROR_PRESETS[404];
  const homePath = isAuthenticated ? '/pics' : '/login';
  const homeLabel = isAuthenticated ? 'Go to gallery' : 'Sign in';

  return (
    <EuiPageTemplate template="centeredBody">
      <EuiEmptyPrompt
        iconType={preset.iconType}
        title={<h2>{title ?? preset.title}</h2>}
        titleSize="l"
        body={<p>{body ?? preset.body}</p>}
        actions={[
          <EuiButton key="home" fill onClick={() => navigate(homePath)}>
            {homeLabel}
          </EuiButton>,
          <EuiButtonEmpty key="back" onClick={() => navigate(-1)}>
            Go back
          </EuiButtonEmpty>,
        ]}
      />
    </EuiPageTemplate>
  );
}
