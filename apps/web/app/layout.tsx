import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Insta Quote — review an uploaded document',
  description:
    'Upload an invoice, packing list or delivery docket and see what was extracted, what was not, and where every number came from.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
