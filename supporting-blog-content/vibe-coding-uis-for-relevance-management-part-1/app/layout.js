import './globals.css';
import Providers from './providers';

export const metadata = {
  title: 'Elasticsearch Query Comparer',
  description: 'Compare Elasticsearch query strategies side by side for relevance tuning',
  icons: {
    icon: '/icons/searchali_logo_1.png',
    apple: '/icons/searchali_logo_1.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
