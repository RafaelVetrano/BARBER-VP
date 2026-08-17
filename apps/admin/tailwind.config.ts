import type { Config } from 'tailwindcss';
import preset from '@barbervp/config/tailwind-preset';

const config: Config = {
  presets: [preset],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    // As classes usadas dentro de `packages/ui` precisam entrar no scan.
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};

export default config;
