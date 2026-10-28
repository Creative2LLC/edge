import { moveInstrumentation } from '../../scripts/scripts.js';

function getFieldSelector(name) {
  return `[data-aue-prop="${name}"], [data-richtext-prop="${name}"]`;
}

function resolveField(scope, name, resource = '') {
  const localField = scope.querySelector(getFieldSelector(name));
  if (localField) {
    return localField;
  }

  if (!resource) {
    return null;
  }

  return document.querySelector(
    `[data-aue-resource="${resource}"][data-aue-prop="${name}"], `
      + `[data-aue-resource="${resource}"][data-richtext-prop="${name}"]`,
  );
}

function readText(node) {
  return node?.textContent.trim() || '';
}

function getFieldRow(node) {
  let current = node;

  while (current?.parentElement) {
    const parent = current.parentElement;
    if (parent.children?.length === 2 && parent.children[1].contains(current)) {
      return parent;
    }
    current = parent;
  }

  return null;
}

function cleanupFieldNode(node, block) {
  if (!node || block.contains(node)) {
    return;
  }

  const row = getFieldRow(node);
  if (row) {
    row.remove();
    return;
  }

  node.remove();
}

function queueCleanup(node, block, nodesToCleanup) {
  if (node && !block.contains(node)) {
    nodesToCleanup.add(node);
  }
}

function getPictureNode(field) {
  if (!field) {
    return null;
  }

  if (field.tagName === 'PICTURE') {
    return field;
  }

  return field.querySelector('picture') || field.closest('picture');
}

function getImageNode(field) {
  if (!field) {
    return null;
  }

  if (field.tagName === 'IMG') {
    return field;
  }

  return field.querySelector('img');
}

function getPageTitle() {
  const metaTitle = document.querySelector('meta[property="og:title"], meta[name="title"]');
  if (metaTitle?.content) {
    return metaTitle.content.trim();
  }

  return document.title.replace(/\s*[|-].*$/, '').trim();
}

function formatPathSegment(segment) {
  return segment
    .replace(/\.html$/u, '')
    .replace(/[-_]+/gu, ' ')
    .replace(/\b\w/gu, (char) => char.toUpperCase());
}

function getBreadcrumbContext() {
  let pathname = window.location.pathname || '/';

  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  const hasHtmlExtension = pathname.endsWith('.html');
  const normalizedPathname = hasHtmlExtension ? pathname.slice(0, -5) : pathname;
  const segments = normalizedPathname.split('/').filter(Boolean);

  if (segments.length <= 1) {
    return {
      parentLabel: 'Leadership',
      parentLink: '/leadership',
    };
  }

  const parentSegments = segments.slice(0, -1);
  const parentBasePath = `/${parentSegments.join('/')}`;
  const parentSegment = parentSegments[parentSegments.length - 1] || 'leadership';

  return {
    parentLabel: formatPathSegment(parentSegment) || 'Leadership',
    parentLink: hasHtmlExtension ? `${parentBasePath}.html` : parentBasePath,
  };
}

export default function decorate(block) {
  const resource = block.getAttribute('data-aue-resource')
    || block.querySelector('[data-aue-resource]')?.getAttribute('data-aue-resource')
    || '';
  const nodesToCleanup = new Set();

  const instrImage = resolveField(block, 'image', resource);
  const instrImageAlt = resolveField(block, 'imageAlt', resource);
  const instrName = resolveField(block, 'name', resource);
  const instrTitle = resolveField(block, 'leaderTitle', resource);
  const instrBio = resolveField(block, 'bio', resource);
  const legacyBreadcrumbParent = resolveField(block, 'breadcrumbParent', resource);
  const legacyBreadcrumbParentLink = resolveField(block, 'breadcrumbParentLink', resource);
  const legacyBreadcrumbCurrent = resolveField(block, 'breadcrumbCurrent', resource);

  [
    instrImage,
    instrImageAlt,
    instrName,
    instrTitle,
    instrBio,
    legacyBreadcrumbParent,
    legacyBreadcrumbParentLink,
    legacyBreadcrumbCurrent,
  ].forEach((node) => queueCleanup(node, block, nodesToCleanup));

  const leaderName = readText(instrName) || getPageTitle();
  const leaderTitle = readText(instrTitle);
  const imageAlt = readText(instrImageAlt) || leaderName;
  const {
    parentLabel: breadcrumbParent,
    parentLink: breadcrumbParentLink,
  } = getBreadcrumbContext();

  const breadcrumb = document.createElement('nav');
  breadcrumb.className = 'leadership-profile-breadcrumb';
  breadcrumb.setAttribute('aria-label', 'Breadcrumb');

  const breadcrumbList = document.createElement('ol');

  const parentItem = document.createElement('li');
  const parentLink = document.createElement('a');
  parentLink.href = breadcrumbParentLink;
  parentLink.textContent = breadcrumbParent;
  parentItem.append(parentLink);
  breadcrumbList.append(parentItem);

  const separator = document.createElement('li');
  separator.className = 'breadcrumb-separator';
  separator.setAttribute('aria-hidden', 'true');
  separator.innerHTML = '<svg width="4" height="8" viewBox="0 0 4 8" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M0.5 0.5L3.5 4L0.5 7.5" stroke="#000000" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  breadcrumbList.append(separator);

  if (leaderName) {
    const currentItem = document.createElement('li');
    currentItem.className = 'breadcrumb-current';
    const currentSpan = document.createElement('span');
    currentSpan.textContent = leaderName;
    currentItem.append(currentSpan);
    breadcrumbList.append(currentItem);
  }

  breadcrumb.append(breadcrumbList);

  const profileContainer = document.createElement('div');
  profileContainer.className = 'leadership-profile-content';

  const imageColumn = document.createElement('div');
  imageColumn.className = 'leadership-profile-image';

  const picture = getPictureNode(instrImage);
  const image = getImageNode(instrImage);
  if (picture) {
    const clonedPicture = picture.cloneNode(true);
    const clonedImage = clonedPicture.querySelector('img');
    if (clonedImage && imageAlt) {
      clonedImage.alt = imageAlt;
    }
    imageColumn.append(clonedPicture);
    moveInstrumentation(instrImage, imageColumn);
  } else if (image) {
    const clonedImage = image.cloneNode(true);
    if (imageAlt) {
      clonedImage.alt = imageAlt;
    }
    imageColumn.append(clonedImage);
    moveInstrumentation(instrImage, imageColumn);
  } else {
    const firstPicture = block.querySelector('picture');
    if (firstPicture) {
      imageColumn.append(firstPicture.cloneNode(true));
    }
  }

  const textColumn = document.createElement('div');
  textColumn.className = 'leadership-profile-text';

  if (leaderName) {
    const nameHeading = document.createElement('h1');
    nameHeading.className = 'leadership-profile-name';
    nameHeading.textContent = leaderName;
    if (instrName) {
      moveInstrumentation(instrName, nameHeading);
    }
    textColumn.append(nameHeading);
  }

  if (leaderTitle) {
    const titleHeading = document.createElement('p');
    titleHeading.className = 'leadership-profile-title';
    titleHeading.textContent = leaderTitle;
    if (instrTitle) {
      moveInstrumentation(instrTitle, titleHeading);
    }
    textColumn.append(titleHeading);
  }

  const bioDiv = document.createElement('div');
  bioDiv.className = 'leadership-profile-bio';
  if (instrBio) {
    bioDiv.innerHTML = instrBio.innerHTML;
    moveInstrumentation(instrBio, bioDiv);
  } else {
    const paragraphs = block.querySelectorAll('p');
    paragraphs.forEach((paragraph) => {
      if (!paragraph.querySelector('picture') && !paragraph.closest('.leadership-profile-image')) {
        bioDiv.append(paragraph.cloneNode(true));
      }
    });
  }
  textColumn.append(bioDiv);

  profileContainer.append(imageColumn, textColumn);

  nodesToCleanup.forEach((node) => cleanupFieldNode(node, block));
  block.replaceChildren(breadcrumb, profileContainer);
}
