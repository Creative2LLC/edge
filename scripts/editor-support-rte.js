/* eslint-disable no-console */
/* eslint-disable no-cond-assign */
/* eslint-disable import/prefer-default-export */

// group editable texts in single wrappers if applicable.
// this script should execute after script.js but before the the universal editor cors script
// and any block being loaded

export function decorateRichtext(container = document) {
  function deleteInstrumentation(element) {
    delete element.dataset.richtextResource;
    delete element.dataset.richtextProp;
    delete element.dataset.richtextFilter;
    delete element.dataset.richtextLabel;
  }

  let element;
  while (element = container.querySelector('[data-richtext-prop]:not(div)')) {
    const {
      richtextResource,
      richtextProp,
      richtextFilter,
      richtextLabel,
    } = element.dataset;
    const editable = element.closest('[data-aue-resource]');
    const isDefaultContentRichtext = Boolean(
      editable?.closest('.default-content-wrapper') && !editable.closest('.block'),
    );
    deleteInstrumentation(element);
    const siblings = [];
    let sibling = element;
    while (sibling = sibling.nextElementSibling) {
      if (sibling.dataset.richtextResource === richtextResource
        && sibling.dataset.richtextProp === richtextProp) {
        deleteInstrumentation(sibling);
        siblings.push(sibling);
      } else break;
    }

    let orphanElements;
    if (richtextResource && richtextProp) {
      orphanElements = document.querySelectorAll(`[data-richtext-id="${richtextResource}"][data-richtext-prop="${richtextProp}"]`);
    } else if (editable) {
      orphanElements = editable.querySelectorAll(`:scope > :not([data-aue-resource]) [data-richtext-prop="${richtextProp}"]`);
    } else {
      console.warn(`Editable parent not found or richtext property ${richtextProp}`);
      return;
    }

    if (orphanElements.length) {
      console.warn('Found orphan elements of a richtext, that were not consecutive siblings of '
        + 'the first paragraph', orphanElements);
      orphanElements.forEach((orphanElement) => deleteInstrumentation(orphanElement));
    } else {
      const group = document.createElement('div');
      const groupResource = richtextResource || editable?.dataset.aueResource;
      if (groupResource) {
        group.dataset.aueResource = groupResource;
        group.dataset.aueBehavior = 'component';
      }
      if (isDefaultContentRichtext && editable?.dataset.aueModel) {
        group.dataset.aueModel = editable.dataset.aueModel;
      }
      if (richtextProp) group.dataset.aueProp = richtextProp;
      if (richtextLabel) group.dataset.aueLabel = richtextLabel;
      if (richtextFilter) group.dataset.aueFilter = richtextFilter;
      group.dataset.aueType = 'richtext';
      element.replaceWith(group);
      group.append(element, ...siblings);
    }
  }
}
