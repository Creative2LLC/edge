function reducedMotionPreferred() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function easeOutCubic(progress) {
  return 1 - ((1 - progress) ** 3);
}

export function parseDisplayNumber(value) {
  const text = String(value || '').trim();
  const match = text.match(/^([^0-9+-]*)([+-]?\d[\d,]*(?:\.\d+)?)(.*)$/);
  if (!match) return null;

  const [, prefix, numericText, suffix] = match;
  const number = Number.parseFloat(numericText.replace(/,/g, ''));
  if (!Number.isFinite(number)) return null;

  const decimals = numericText.includes('.')
    ? numericText.split('.')[1].length
    : 0;

  return {
    number,
    prefix,
    suffix,
    decimals,
    useGrouping: numericText.includes(',') || Math.abs(number) >= 1000,
  };
}

export function formatCountValue(value, options = {}) {
  const {
    prefix = '',
    suffix = '',
    decimals = 0,
    useGrouping = true,
    locale = 'en-US',
  } = options;

  return `${prefix}${value.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping,
  })}${suffix}`;
}

export function animateCountUp(element, options = {}) {
  if (!element) return;

  const {
    value,
    displayValue,
    duration = 1100,
    locale = 'en-US',
  } = options;
  const finalText = String(displayValue || element.textContent || '').trim();
  const parsedDisplay = parseDisplayNumber(finalText);
  const hasNumericValue = Number.isFinite(Number(value));
  const target = parsedDisplay?.number ?? (hasNumericValue ? Number(value) : null);

  if (!Number.isFinite(target)) {
    if (finalText) element.textContent = finalText;
    return;
  }

  const formatOptions = {
    prefix: parsedDisplay?.prefix || '',
    suffix: parsedDisplay?.suffix || '',
    decimals: parsedDisplay?.decimals ?? 0,
    useGrouping: parsedDisplay?.useGrouping ?? true,
    locale,
  };

  element.setAttribute('aria-label', finalText || formatCountValue(target, formatOptions));

  if (reducedMotionPreferred() || duration <= 0) {
    element.textContent = finalText || formatCountValue(target, formatOptions);
    return;
  }

  const start = performance.now();

  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = easeOutCubic(progress);
    element.textContent = progress >= 1
      ? (finalText || formatCountValue(target, formatOptions))
      : formatCountValue(target * eased, formatOptions);

    if (progress < 1) window.requestAnimationFrame(tick);
  }

  window.requestAnimationFrame(tick);
}

export function animateCountUpOnVisible(element, options = {}) {
  if (!element) return;

  if (reducedMotionPreferred() || !('IntersectionObserver' in window)) {
    animateCountUp(element, { ...options, duration: 0 });
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    const isVisible = entries.some((entry) => entry.isIntersecting);
    if (!isVisible) return;

    animateCountUp(element, options);
    observer.disconnect();
  }, {
    threshold: 0.3,
  });

  observer.observe(element);
}
