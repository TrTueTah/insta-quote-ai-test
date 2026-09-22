import type { NextConfig } from 'next';

const config: NextConfig = {
  // The shared Zod schemas are consumed from source, so the single source of truth is a real
  // import rather than a published build artifact.
  transpilePackages: ['@insta-quote/contracts'],

  webpack: (webpackConfig) => {
    // packages/contracts uses ESM-correct specifiers (`./evidence.js`) so it stays valid
    // Node ESM. Webpack needs telling that those resolve to the TypeScript sources rather
    // than degrading the package's imports to suit one bundler.
    webpackConfig.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return webpackConfig;
  },
};

export default config;
