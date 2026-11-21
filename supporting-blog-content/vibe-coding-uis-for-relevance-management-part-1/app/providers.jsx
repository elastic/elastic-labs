'use client';

import { EuiProvider } from '@elastic/eui';

export default function Providers({ children }) {
  return <EuiProvider colorMode="light">{children}</EuiProvider>;
}
