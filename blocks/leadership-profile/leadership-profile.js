import { moveInstrumentation } from '../../scripts/scripts.js';

export default function decorate(block) {
  // Read instrumented fields (Universal Editor)
  const instrImage = block.querySelector('[data-aue-prop="image"]');
  const instrName = block.querySelector('[data-aue-prop="name"]');
  const instrTitle = block.querySelector('[data-aue-prop="leaderTitle"]');
  const instrBio = block.querySelector('[data-aue-prop="bio"]');
  const instrBreadcrumbParent = block.querySelector('[data-aue-prop="breadcrumbParent"]');
  const instrBreadcrumbParentLink = block.querySelector('[data-aue-prop="breadcrumbParentLink"]');
  const instrBreadcrumbCurrent = block.querySelector('[data-aue-prop="breadcrumbCurrent"]');

  // Build breadcrumb
  const breadcrumb = document.createElement('nav');
  breadcrumb.className = 'leadership-profile-breadcrumb';
  breadcrumb.setAttribute('aria-label', 'Breadcrumb');

  const breadcrumbList = document.createElement('ol');

  // Parent breadcrumb item
  const parentItem = document.createElement('li');
  const parentLink = document.createElement('a');
  if (instrBreadcrumbParentLink) {
    parentLink.href = instrBreadcrumbParentLink.textContent.trim();
    moveInstrumentation(instrBreadcrumbParentLink, parentLink);
  }
  if (instrBreadcrumbParent) {
    parentLink.textContent = instrBreadcrumbParent.textContent.trim() || 'Leadership';
    moveInstrumentation(instrBreadcrumbParent, parentLink);
  } else {
    parentLink.textContent = 'Leadership';
  }
  parentItem.appendChild(parentLink);
  breadcrumbList.appendChild(parentItem);

  // Chevron separator
  const separator = document.createElement('li');
  separator.className = 'breadcrumb-separator';
  separator.setAttribute('aria-hidden', 'true');
  separator.innerHTML = '<svg width="4" height="8" viewBox="0 0 4 8" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M0.5 0.5L3.5 4L0.5 7.5" stroke="#000000" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  breadcrumbList.appendChild(separator);

  // Current breadcrumb item
  const currentItem = document.createElement('li');
  currentItem.className = 'breadcrumb-current';
  const currentSpan = document.createElement('span');
  if (instrBreadcrumbCurrent) {
    currentSpan.textContent = instrBreadcrumbCurrent.textContent.trim() || '';
    moveInstrumentation(instrBreadcrumbCurrent, currentSpan);
  }
  currentItem.appendChild(currentSpan);
  breadcrumbList.appendChild(currentItem);

  breadcrumb.appendChild(breadcrumbList);

  // Build profile layout
  const profileContainer = document.createElement('div');
  profileContainer.className = 'leadership-profile-content';

  // Image column
  const imageColumn = document.createElement('div');
  imageColumn.className = 'leadership-profile-image';

  if (instrImage) {
    const picture = instrImage.querySelector('picture') || instrImage.closest('picture');
    if (picture) {
      imageColumn.appendChild(picture.cloneNode(true));
      moveInstrumentation(instrImage, imageColumn);
    } else {
      const img = instrImage.querySelector('img');
      if (img) {
        imageColumn.appendChild(img.cloneNode(true));
        moveInstrumentation(instrImage, imageColumn);
      }
    }
  } else {
    // Fallback: find picture in the first row
    const firstPicture = block.querySelector('picture');
    if (firstPicture) {
      imageColumn.appendChild(firstPicture.cloneNode(true));
    }
  }

  // Text column
  const textColumn = document.createElement('div');
  textColumn.className = 'leadership-profile-text';

  // Name
  const nameHeading = document.createElement('h1');
  nameHeading.className = 'leadership-profile-name';
  if (instrName) {
    nameHeading.textContent = instrName.textContent.trim();
    moveInstrumentation(instrName, nameHeading);
  } else {
    // Fallback: look for first heading or bold text
    const h = block.querySelector('h1, h2, h3');
    if (h) nameHeading.textContent = h.textContent.trim();
  }
  textColumn.appendChild(nameHeading);

  // Title
  const titleHeading = document.createElement('p');
  titleHeading.className = 'leadership-profile-title';
  if (instrTitle) {
    titleHeading.textContent = instrTitle.textContent.trim();
    moveInstrumentation(instrTitle, titleHeading);
  }
  textColumn.appendChild(titleHeading);

  // Bio
  const bioDiv = document.createElement('div');
  bioDiv.className = 'leadership-profile-bio';
  if (instrBio) {
    bioDiv.innerHTML = instrBio.innerHTML;
    moveInstrumentation(instrBio, bioDiv);
  } else {
    // Fallback: collect remaining paragraphs
    const paragraphs = block.querySelectorAll('p');
    paragraphs.forEach((p) => {
      if (!p.querySelector('picture') && !p.closest('.leadership-profile-image')) {
        bioDiv.appendChild(p.cloneNode(true));
      }
    });
  }
  textColumn.appendChild(bioDiv);

  profileContainer.appendChild(imageColumn);
  profileContainer.appendChild(textColumn);

  // Clear block and rebuild
  block.textContent = '';
  block.appendChild(breadcrumb);
  block.appendChild(profileContainer);
}
