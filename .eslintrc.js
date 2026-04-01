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
      '*': 10,
      'news-article': 5,
      resources: 5,
      'resource-item': 7,
      'resources-browser': 6,
      'resources-browser-item': 8,
      'mega-nav-row': 6,
      'mega-nav-top-link': 5,
      'impact-chain-item': 5,
      'leader-card': 7,
      'leadership-profile': 8,
      'cta-card-1': 9,
      'cta-card-2': 8,
      'info-card': 11,
      'card-row-item': 9,
      'card-row-detailed-item': 14,
      'split-card': 12,
      'image-text-card-row-item': 9,
      'split-card-carousel-item': 9,
      'icon-card-carousel-item': 10,
      'card-row-compact-item': 10,
      statistics: 5,
      'job-posting-item': 10,
      'job-postings': 8,
      'internship-program': 18,
      'detailed-carousel-item': 11,
    }],
    'xwalk/no-orphan-collapsible-fields': 'off',
  },
};
