import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CopJe! - Free Online Rubber Stamp Maker',
  description:
    'Create custom rubber stamps online for free. Add text, shapes, images, presets, and export PNG/SVG quickly.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
