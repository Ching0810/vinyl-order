import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';

/**
 * Design system for the storefront.
 *
 * Direction: editorial record-shop — warm off-white paper, near-black ink, and a
 * single amber accent borrowed from vinyl label print. Covers are the only
 * saturated thing on the page, so the chrome stays deliberately quiet.
 */

/** Accent scale. Amber/ochre reads "analog" without competing with cover art. */
const brand = {
  50: { value: '#FDF8ED' },
  100: { value: '#F9EBCB' },
  200: { value: '#F2D79B' },
  300: { value: '#E9BC63' },
  400: { value: '#E0A23A' },
  500: { value: '#C9871F' },
  600: { value: '#A66A16' },
  700: { value: '#7F4F14' },
  800: { value: '#5C3A13' },
  900: { value: '#402910' },
  950: { value: '#241708' },
};

/** Warm neutral ramp — greys tinted toward paper rather than pure grey. */
const ink = {
  50: { value: '#FAF9F7' },
  100: { value: '#F2F0EC' },
  200: { value: '#E4E1DA' },
  300: { value: '#CFCAC0' },
  400: { value: '#A9A296' },
  500: { value: '#837B6E' },
  600: { value: '#635C51' },
  700: { value: '#4A443C' },
  800: { value: '#302C27' },
  900: { value: '#1C1917' },
  950: { value: '#100E0D' },
};

const config = defineConfig({
  globalCss: {
    'html, body': { height: '100%' },
    body: {
      margin: 0,
      bg: 'bg',
      color: 'fg',
      fontFamily: 'body',
      // Font smoothing is left to Chakra's reset layer, which already sets
      // `-webkit-font-smoothing: antialiased` — what the large display type wants.
    },
    '::selection': { bg: 'brand.200', color: 'ink.950' },
    // Let the sticky header offset in-page anchor jumps.
    ':target': { scrollMarginTop: '24' },
  },

  theme: {
    breakpoints: {
      base: '0rem',
      sm: '30rem',
      md: '48rem',
      lg: '62rem',
      xl: '80rem',
      '2xl': '90rem',
    },

    tokens: {
      colors: { brand, ink },
      fonts: {
        // Display face carries the editorial headings; body stays neutral.
        // Noto Sans TC keeps Chinese titles from falling back mid-line.
        heading: {
          value: '"Helvetica Neue", Inter, system-ui, -apple-system, "Noto Sans TC", sans-serif',
        },
        body: {
          value: 'Inter, system-ui, -apple-system, "Noto Sans TC", sans-serif',
        },
      },
      letterSpacings: {
        tightest: { value: '-0.045em' },
        display: { value: '-0.03em' },
        label: { value: '0.14em' },
      },
      radii: {
        card: { value: '0.875rem' },
        panel: { value: '1.5rem' },
      },
      shadows: {
        card: { value: '0 1px 2px rgb(16 14 13 / 6%), 0 8px 24px -12px rgb(16 14 13 / 18%)' },
        lift: { value: '0 2px 4px rgb(16 14 13 / 8%), 0 24px 48px -20px rgb(16 14 13 / 28%)' },
      },
    },

    semanticTokens: {
      colors: {
        // Repaint the neutrals onto the warm ramp so nothing is cold grey.
        bg: {
          DEFAULT: { value: { _light: '{colors.ink.50}', _dark: '{colors.ink.950}' } },
          subtle: { value: { _light: '{colors.ink.100}', _dark: '{colors.ink.900}' } },
          muted: { value: { _light: '{colors.ink.200}', _dark: '{colors.ink.800}' } },
          panel: { value: { _light: '#FFFFFF', _dark: '{colors.ink.900}' } },
          inverted: { value: { _light: '{colors.ink.950}', _dark: '{colors.ink.50}' } },
        },
        fg: {
          DEFAULT: { value: { _light: '{colors.ink.950}', _dark: '{colors.ink.50}' } },
          muted: { value: { _light: '{colors.ink.600}', _dark: '{colors.ink.400}' } },
          subtle: { value: { _light: '{colors.ink.500}', _dark: '{colors.ink.500}' } },
          inverted: { value: { _light: '{colors.ink.50}', _dark: '{colors.ink.950}' } },
        },
        border: {
          DEFAULT: { value: { _light: '{colors.ink.200}', _dark: '{colors.ink.800}' } },
          muted: { value: { _light: '{colors.ink.100}', _dark: '{colors.ink.900}' } },
        },
        // Full colorPalette contract so `colorPalette="brand"` works on
        // Button/Badge/Input the same way the built-in palettes do.
        brand: {
          solid: { value: '{colors.brand.500}' },
          contrast: { value: '{colors.ink.950}' },
          fg: { value: { _light: '{colors.brand.700}', _dark: '{colors.brand.300}' } },
          muted: { value: { _light: '{colors.brand.100}', _dark: '{colors.brand.900}' } },
          subtle: { value: { _light: '{colors.brand.50}', _dark: '{colors.brand.950}' } },
          emphasized: { value: { _light: '{colors.brand.200}', _dark: '{colors.brand.800}' } },
          focusRing: { value: '{colors.brand.500}' },
        },
      },
    },

    textStyles: {
      /** Small all-caps eyebrow above section headings. */
      eyebrow: {
        value: {
          fontSize: 'xs',
          fontWeight: 'bold',
          letterSpacing: 'label',
          textTransform: 'uppercase',
          color: 'brand.fg',
        },
      },
      /** Oversized editorial heading. */
      display: {
        value: {
          fontFamily: 'heading',
          fontWeight: 'bold',
          letterSpacing: 'display',
          lineHeight: '1.05',
        },
      },
    },
  },
});

export const chakraSystem = createSystem(defaultConfig, config);
