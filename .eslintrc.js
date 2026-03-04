module.exports = {
  root: true,
  extends: [
    'airbnb-base',
    'plugin:json/recommended',
    'plugin:xwalk/recommended',
  ],
  env: {
    browser: true,
  },
  parser: '@babel/eslint-parser',
  parserOptions: {
    allowImportExportEverywhere: true,
    sourceType: 'module',
    requireConfigFile: false,
  },
  rules: {
    'import/extensions': ['error', { js: 'always' }], // require js file extensions in imports
    'import/no-extraneous-dependencies': ['error', {
      devDependencies: [
        'vite.config.js',
        'postcss.config.cjs',
        'tailwind.config.cjs',
        'scripts/**',
        '**/*.test.js',
        '**/*.spec.js',
      ],
    }],
    'linebreak-style': ['error', 'unix'], // enforce unix linebreaks
    'no-param-reassign': [2, { props: false }], // allow modifying properties of param
    'xwalk/max-cells': ['error', {
      '*': 4,
      hero: 20,
      'news-article': 5,
      'resource-item': 6,
      'mega-nav-row': 6,
      'mega-nav-top-link': 5,
      'impact-chain-item': 5,
      'leadership-profile': 8,
    }],
    'xwalk/no-orphan-collapsible-fields': 'off',
  },
};
