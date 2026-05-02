import CopJeClient from '../CopJeClient';
import CopJeThemeBootstrap from '../CopJeThemeBootstrap';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'COP JE! - Free Online Rubber Stamp Maker',
  description:
    'Create custom rubber stamps online for free. Add text, shapes, images, presets, and export PNG/SVG quickly.',
};

export default function CopJeCopjeRoute() {
  return (
    <>
      <CopJeThemeBootstrap />
      <CopJeClient />
    </>
  );
}
