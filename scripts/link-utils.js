const EDGE_CONTENT_PREFIX = '/content/edge';

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

  const cleanPath = pathname.replace(/\/+$/, '') || '/';

  if (isAuthorHost()) {
    if (cleanPath === EDGE_CONTENT_PREFIX || cleanPath.startsWith(`${EDGE_CONTENT_PREFIX}/`)) {
      return `${cleanPath}${suffix}`;
    }

    return `${EDGE_CONTENT_PREFIX}${cleanPath === '/' ? '' : cleanPath}${suffix}`;
  }

  if (cleanPath === EDGE_CONTENT_PREFIX) return `/${suffix}`;
  if (cleanPath.startsWith(`${EDGE_CONTENT_PREFIX}/`)) {
    return `${cleanPath.slice(EDGE_CONTENT_PREFIX.length) || '/'}${suffix}`;
  }

  return `${cleanPath}${suffix}`;
}
