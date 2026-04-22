import { getMetadata } from './aem.js';
import { normalizeApiBaseUrl, normalizeSitePath } from './search-utils.js';

const DEFAULT_SITE_SEARCH_CONFIG = Object.freeze({
  apiBaseUrl: 'https://stunning-dust-ntqeawud3dqy.on-vapor.com',
  resultsPath: '/content/edge/search',
  placeholder: 'Search the site',
});

const SITE_SEARCH_CONFIG_BY_HOST = Object.freeze({
  // Configure search once per environment here instead of setting page metadata everywhere.
  // Replace the placeholder values below with your real backend/search page settings.
  'author-p171653-e1855116.adobeaemcloud.com': {
    apiBaseUrl: '',
    resultsPath: '/content/edge/search',
  },
});

function resolveHostConfig(hostname = window.location.hostname) {
  return SITE_SEARCH_CONFIG_BY_HOST[hostname] || {};
}

export function getSiteSearchConfig(overrides = {}) {
  const runtimeConfig = window.hlx?.siteSearchConfig || {};
  const metadataConfig = {
    apiBaseUrl: getMetadata('search-api-base-url'),
    resultsPath: getMetadata('search-results-path'),
    placeholder: getMetadata('search-placeholder'),
  };

  const merged = {
    ...DEFAULT_SITE_SEARCH_CONFIG,
    ...resolveHostConfig(),
    ...runtimeConfig,
    ...metadataConfig,
    ...overrides,
  };

  return {
    apiBaseUrl: normalizeApiBaseUrl(merged.apiBaseUrl),
    resultsPath: normalizeSitePath(merged.resultsPath, DEFAULT_SITE_SEARCH_CONFIG.resultsPath),
    placeholder: `${merged.placeholder || DEFAULT_SITE_SEARCH_CONFIG.placeholder}`.trim()
      || DEFAULT_SITE_SEARCH_CONFIG.placeholder,
  };
}
