import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Audio Effect Builder',
  description: 'Build, audition, and shape audio effects through a focused visual signal chain.',
  openGraph: {
    title: 'Audio Effect Builder',
    description: 'Shape sound. Expose controls. Build the signal path.',
    type: 'website',
    images: [{ url: '/og.png', width: 1731, height: 909, alt: 'Audio Effect Builder signal chain' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Audio Effect Builder',
    description: 'Shape sound. Expose controls. Build the signal path.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
