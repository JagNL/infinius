import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Infinius',
  description: 'Autonomous AI agent platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
