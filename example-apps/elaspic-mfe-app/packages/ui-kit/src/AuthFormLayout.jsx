import { EuiPageTemplate, EuiPanel, EuiSpacer, EuiTitle } from '@elastic/eui';

const FORM_MAX_WIDTH = 448;

export function AuthFormLayout({ title, children }) {
  return (
    <EuiPageTemplate grow minHeight="100vh" panelled={false} restrictWidth={false}>
      <EuiPageTemplate.Section alignment="center" grow restrictWidth={FORM_MAX_WIDTH}>
        <EuiPanel paddingSize="l" hasShadow>
          <EuiTitle size="l">
            <h1>{title}</h1>
          </EuiTitle>
          <EuiSpacer size="l" />
          {children}
        </EuiPanel>
      </EuiPageTemplate.Section>
    </EuiPageTemplate>
  );
}
