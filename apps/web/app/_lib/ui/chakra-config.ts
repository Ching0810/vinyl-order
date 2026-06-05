import { createSystem, defaultConfig } from '@chakra-ui/react';

// Base color tokens — pending a real design system. Add as `name: { value: ... }`.
const colors = {};

const shadows = {
  default: { value: '0px 1px 5px rgb(0 0 0 / 20%)' },
};

const breakpoints = {
  base: '0rem',
  md: '48rem',
  xl: '60rem',
  '2xl': '90rem',
};

// Global CSS applied app-wide. This replaces a hand-written globals.css —
// Chakra's defaultConfig already provides a CSS reset; we only add the few
// base rules we care about (full-height layout, body font/color).
const globalCss = {
  'html, body': { height: '100%' },
  body: {
    margin: 0,
    fontFamily: 'Roboto, "Noto Sans TC", sans-serif',
    color: '#3D3D3D',
    WebkitFontSmoothing: 'auto',
  },
};

export const chakraSystem = createSystem(defaultConfig, {
  globalCss,
  theme: {
    breakpoints,
    tokens: {
      colors,
      shadows,
    },
  },
});
