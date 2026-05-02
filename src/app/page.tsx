import type { Metadata } from 'next';
import CopJeClient from './CopJeClient';
import CopJeThemeBootstrap from './CopJeThemeBootstrap';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'COP JE! - Free Online Rubber Stamp Maker',
  description:
    'Create custom rubber stamps online for free. Add text, shapes, images, presets, and export PNG/SVG quickly.',
};

export default function CopJePage() {
  return (
    <>
      <CopJeThemeBootstrap />
      <CopJeClient />
    </>
  );
}
