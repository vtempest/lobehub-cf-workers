import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: ['src/app/**/*.ts{x,}'],
  ignore: [
    // Other directories
    'packages/**',
    'scripts/**',
    // Config files
    '*.config.{js,ts,mjs,cjs}',
    'next-env.d.ts',
  ],
  ignoreDependencies: [],
  ignoreExportsUsedInFile: true,
  project: ['src/**/*.ts{x,}'],
};

export default config;
