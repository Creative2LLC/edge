const EDGE_CONTENT_PREFIX = '/content/edge';
const SUPPORTED_LOCALE_PREFIXES = ['/es'];

function isAuthorHost() {
  return window.location.hostname.includes('adobeaemcloud.com')
    || window.location.pathname.startsWith(`${EDGE_CONTENT_PREFIX}/`);
}

function isAemDeliveryHost(hostname) {
  return hostname.endsWith('.aem.page')
    || hostname.endsWith('.aem.live')
    || hostname.includes('adobeaemcloud.com');
}

function splitPath(value) {
  const match = `${value || ''}`.match(/^([^?#]*)([?#].*)?$/);
  return {
    pathname: match?.[1] || '',
    suffix: match?.[2] || '',
  };
}

function hasFileExtension(pathname) {
  const lastSegment = pathname.split('/').pop() || '';
  return /\.[a-z0-9]+$/i.test(lastSegment);
}

function withHtmlExtension(pathname) {
  if (pathname === '/') return '/index.html';
  if (pathname.endsWith('.html') || hasFileExtension(pathname)) return pathname;
  return `${pathname}.html`;
}

function stripHtmlExtension(pathname) {
  return pathname.replace(/\.html$/i, '');
}

function currentLocalePrefix() {
  let pathname = stripHtmlExtension(window.location.pathname || '/');

  if (pathname === EDGE_CONTENT_PREFIX || pathname.startsWith(`${EDGE_CONTENT_PREFIX}/`)) {
    pathname = pathname.slice(EDGE_CONTENT_PREFIX.length) || '/';
  }

  return SUPPORTED_LOCALE_PREFIXES.find((locale) => (
    pathname === locale || pathname.startsWith(`${locale}/`)
  )) || '';
}

function applyCurrentLocale(pathname) {
  const locale = currentLocalePrefix();
  if (!locale) return pathname;

  if (pathname === locale || pathname.startsWith(`${locale}/`)) return pathname;

  if (pathname === EDGE_CONTENT_PREFIX) return `${EDGE_CONTENT_PREFIX}${locale}`;

  if (pathname.startsWith(`${EDGE_CONTENT_PREFIX}/`)) {
    const relativePath = pathname.slice(EDGE_CONTENT_PREFIX.length) || '/';
    if (relativePath === locale || relativePath.startsWith(`${locale}/`)) return pathname;
    return `${EDGE_CONTENT_PREFIX}${locale}${relativePath === '/' ? '' : relativePath}`;
  }

  return `${locale}${pathname === '/' ? '' : pathname}`;
}

export default function resolveSiteHref(value) {
  const raw = `${value || ''}`.trim();
  if (!raw || raw === '#') return raw || '#';
  if (/^(mailto|tel|sms):/i.test(raw)) return raw;

  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    if (url.origin !== window.location.origin && !isAemDeliveryHost(url.hostname)) return raw;
    return resolveSiteHref(`${url.pathname}${url.search}${url.hash}`);
  }

  const { pathname, suffix } = splitPath(raw);
  if (!pathname.startsWith('/')) return raw;
  if (pathname.startsWith('/api/') || pathname.startsWith('/content/dam/')) return raw;

  const cleanPath = applyCurrentLocale(pathname.replace(/\/+$/, '') || '/');

  if (isAuthorHost()) {
    if (cleanPath === EDGE_CONTENT_PREFIX || cleanPath.startsWith(`${EDGE_CONTENT_PREFIX}/`)) {
      return `${withHtmlExtension(cleanPath)}${suffix}`;
    }

    const authorPath = `${EDGE_CONTENT_PREFIX}${cleanPath === '/' ? '' : cleanPath}`;
    return `${withHtmlExtension(authorPath)}${suffix}`;
  }

  if (cleanPath === EDGE_CONTENT_PREFIX) return `/${suffix}`;
  if (cleanPath.startsWith(`${EDGE_CONTENT_PREFIX}/`)) {
    return `${cleanPath.slice(EDGE_CONTENT_PREFIX.length) || '/'}${suffix}`;
  }

  return `${cleanPath}${suffix}`;
}
