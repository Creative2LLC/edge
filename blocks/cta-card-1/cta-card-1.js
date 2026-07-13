import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  getAueResourcePath,
  getBlockRows,
  readAueResourceFields,
  readLinkField,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';

// Hex-color select fields never get data-aue-prop instrumentation in the editor, so their
// positional fallback is only as reliable as the fixed index it's given — which breaks
// whenever an EARLIER field (even a non-color one) has no row of its own and everything
// after it shifts. A resource JSON fetch, keyed by field name, sidesteps row position
// entirely and is the authoritative correction. Matches the pattern in cards.js /
// info-cards-grid.js / connect-grid.js.
const COLOR_FIELD_NAMES = ['gradientLeft', 'gradientRight', 'buttonColor', 'buttonTextColor', 'button2Color', 'button2BackgroundColor'];

function isValidHexColor(value) {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(String(value || '').trim());
}

// Fields with no authored value frequently don't get their own row in the exported
// markup at all, so a positional fallback can silently grab a completely different
// field's value. In the editor, named data-aue-prop lookup is reliable whenever a
// field actually has content, so a failed name lookup there means the field is
// genuinely empty — never fall back to a position guess in that case. Positional
// fallback is only meaningful on true published pages (see cards.js /
// colored-icon-text.js for the same pattern).
function getField(block, rows, name, index, isEditor) {
  return readTextField(block, name, { fallbackCell: isEditor ? null : rows[index] });
}

// Hex-color "select" fields (regex-validated) render in the editor as a bare
// <a href="#hex">#hex</a> with NO data-aue-prop at all — confirmed from live markup —
// unlike every other field type, which does get real instrumentation whenever it has
// content. Name-based lookup can never succeed for these, so unlike getField above,
// positional fallback must stay enabled in the editor too, or these fields always read
// empty (this caused a live regression: color pickers falling back to defaults because
// the field could never be read in the editor).
function getColorField(block, rows, name, index) {
  return readTextField(block, name, { fallbackCell: rows[index] });
}

function getRichField(block, rows, name, index, isEditor) {
  return readRichTextField(block, name, { fallbackCell: isEditor ? null : rows[index] });
}

function getLinkField(block, rows, name, index, isEditor) {
  return readLinkField(block, name, { fallbackCell: isEditor ? null : rows[index] });
}

function directRowOf(block, element) {
  let row = element;
  while (row && row.parentElement !== block) {
    row = row.parentElement;
  }
  return row && row.parentElement === block ? row : null;
}

// Hides (in the editor) rather than removes a field's row/source — permanently
// removing an aue-tracked node that was never moveInstrumentation'd elsewhere
// desyncs Universal Editor's resource tree from the DOM and breaks live-patching
// of that field on the next decoration pass (see cards.js's readSetting for the
// same pattern). Hidden nodes get swept into an archive before the final
// block.replaceChildren() call so they survive being detached from `block`.
function removeOrHideField(block, source, isEditor) {
  if (!source) return;
  const row = directRowOf(block, source) || source;
  if (isEditor) row.hidden = true;
  else row.remove();
}

function buildTextElement(tag, className, field) {
  if (!field?.value && !field?.source?.childNodes?.length) return null;
  const el = document.createElement(tag);
  el.className = className;
  if (field.source) {
    moveInstrumentation(field.source, el);
    while (field.source.firstChild) el.append(field.source.firstChild);
    field.source.remove();
  } else {
    el.textContent = field.value;
  }
  return el;
}

function buildRichTextElement(tag, className, field) {
  if (!field?.html && !field?.source?.childNodes?.length) return null;
  const el = document.createElement(tag);
  el.className = className;
  if (field.source) {
    moveInstrumentation(field.source, el);
    while (field.source.firstChild) el.append(field.source.firstChild);
    field.source.remove();
  } else if (field.html) {
    el.innerHTML = field.html;
  } else {
    el.textContent = field.text || '';
  }
  return el;
}

// Corrects color fields using the resource's own JSON (keyed by field name, so it's
// immune to the row-position drift that breaks positional fallback). Fires after the
// block already rendered with its best synchronous guess; only touches fields the fetch
// actually returned a valid hex value for, so a malformed/unexpected API response can't
// corrupt an already-correct render.
function syncColors(block, styleType, defaultLeftColor, defaultRightColor) {
  const resourcePath = getAueResourcePath(block);
  if (!resourcePath) return;

  readAueResourceFields(resourcePath, COLOR_FIELD_NAMES)
    .then((fields) => {
      Object.keys(fields).forEach((key) => {
        if (!isValidHexColor(fields[key])) delete fields[key];
      });
      if (!Object.keys(fields).length) return;

      if (fields.gradientLeft || fields.gradientRight) {
        const leftColor = fields.gradientLeft || defaultLeftColor;
        const rightColor = fields.gradientRight || defaultRightColor;
        block.style.setProperty('background', `linear-gradient(to right, ${leftColor}, ${rightColor})`, 'important');
      }

      const primaryBtn = block.querySelector(
        '.cta-card-1-button:not(.cta-card-1-button-secondary):not(.cta-card-1-button-tertiary)',
      );
      if (primaryBtn) {
        if (fields.buttonColor) primaryBtn.style.setProperty('background-color', fields.buttonColor, 'important');
        if (fields.buttonTextColor) primaryBtn.style.setProperty('color', fields.buttonTextColor, 'important');
      }

      const secondaryBtn = block.querySelector('.cta-card-1-button-secondary');
      if (secondaryBtn) {
        if (fields.button2Color) {
          if (styleType !== 'variant-3') {
            secondaryBtn.style.setProperty('border', `1px solid ${fields.button2Color}`, 'important');
          }
          secondaryBtn.style.setProperty('color', fields.button2Color, 'important');
        }
        if (fields.button2BackgroundColor) {
          secondaryBtn.style.setProperty('background-color', fields.button2BackgroundColor, 'important');
        }
      }
    });
}

export default function decorate(block) {
  const isEditor = Boolean(document.querySelector('[data-aue-resource]'));
  const rows = getBlockRows(block);

  // Indices below match _cta-card-1.json's ACTUAL current field order (fields were
  // regrouped under UI tabs by a later commit — belowButtonText was pulled to the front
  // of the Content tab, right after subtitle, shifting every button field after it).
  const titleField = getField(block, rows, 'title', 0, isEditor);
  const subtitleField = getRichField(block, rows, 'subtitle', 1, isEditor);
  const belowButtonTextField = getRichField(block, rows, 'belowButtonText', 2, isEditor);
  const gradientLeftField = getColorField(block, rows, 'gradientLeft', 3);
  const gradientRightField = getColorField(block, rows, 'gradientRight', 4);
  const buttonTextField = getField(block, rows, 'buttonText', 5, isEditor);
  const buttonLinkField = getLinkField(block, rows, 'buttonLink', 6, isEditor);
  const buttonColorField = getColorField(block, rows, 'buttonColor', 7);
  const buttonTextColorField = getColorField(block, rows, 'buttonTextColor', 8);
  const buttonSubtextField = getField(block, rows, 'buttonSubtext', 9, isEditor);
  const button2TextField = getField(block, rows, 'button2Text', 10, isEditor);
  const button2LinkField = getLinkField(block, rows, 'button2Link', 11, isEditor);
  const button2ColorField = getColorField(block, rows, 'button2Color', 12);
  const button2BackgroundColorField = getColorField(block, rows, 'button2BackgroundColor', 13);
  const button2SubtextField = getField(block, rows, 'button2Subtext', 14, isEditor);
  const button2LocationField = getField(block, rows, 'button2Location', 15, isEditor);
  const button3TextField = getField(block, rows, 'button3Text', 16, isEditor);
  const button3LinkField = getLinkField(block, rows, 'button3Link', 17, isEditor);
  const styleTypeField = getField(block, rows, 'styleType', 18, isEditor);
  const button2Location = button2LocationField.value.toLowerCase() === 'left' ? 'left' : 'right';
  if (button2Location === 'left') block.classList.add('cta-card-1-button2-left');
  removeOrHideField(block, button2LocationField.source, isEditor);

  const styleType = styleTypeField.value.toLowerCase();
  if (styleType === 'variant-2') {
    block.classList.add('cta-card-1-variant-2');
  } else if (styleType === 'variant-3') {
    block.classList.add('cta-card-1-variant-3');
  } else if (styleType === 'variant-4') {
    block.classList.add('cta-card-1-variant-4');
  }
  removeOrHideField(block, styleTypeField.source, isEditor);

  // Apply gradient background
  const leftColor = gradientLeftField.value || '#ffffff';
  const rightColor = gradientRightField.value || '#ffffff';
  block.style.setProperty('background', `linear-gradient(to right, ${leftColor}, ${rightColor})`, 'important');

  // Build inner layout
  const left = document.createElement('div');
  left.className = 'cta-card-1-left';

  const title = buildTextElement('h2', 'cta-card-1-title', titleField);
  if (title) left.append(title);

  const subtitle = buildRichTextElement('div', 'cta-card-1-subtitle', subtitleField);
  if (subtitle) left.append(subtitle);

  // Third button (Variant 4 only) — outlined, sits under the subtitle on the left.
  const btn3Label = button3TextField.value;
  const btn3Href = button3LinkField.value;
  if (styleType === 'variant-4' && btn3Label) {
    const btn3 = document.createElement(btn3Href ? 'a' : 'button');
    btn3.className = 'cta-card-1-button cta-card-1-button-tertiary';
    if (btn3Href) btn3.href = btn3Href;
    if (!btn3Href) btn3.type = 'button';
    if (button3TextField.source) {
      moveInstrumentation(button3TextField.source, btn3);
      button3TextField.source.remove();
    }
    btn3.textContent = btn3Label;
    left.append(btn3);
  } else {
    removeOrHideField(block, button3TextField.source, isEditor);
  }
  removeOrHideField(block, button3LinkField.source, isEditor);

  // Right side
  const right = document.createElement('div');
  right.className = 'cta-card-1-right';

  const btnLabel = buttonTextField.value || 'Learn More';
  const btnHref = buttonLinkField.value;
  const btnSubtext = buttonSubtextField.value;
  const btn = document.createElement(btnHref ? 'a' : 'button');
  btn.className = 'cta-card-1-button';
  if (btnHref) btn.href = btnHref;
  if (!btnHref) btn.type = 'button';
  if (buttonTextField.source) {
    moveInstrumentation(buttonTextField.source, btn);
    buttonTextField.source.remove();
  }

  if (btnSubtext) {
    btn.classList.add('has-subtext');
    const mainSpan = document.createElement('span');
    mainSpan.className = 'cta-card-1-button-main';
    mainSpan.textContent = btnLabel;
    const subSpan = document.createElement('span');
    subSpan.className = 'cta-card-1-button-subtext';
    subSpan.textContent = btnSubtext;
    if (buttonSubtextField.source) {
      moveInstrumentation(buttonSubtextField.source, subSpan);
      buttonSubtextField.source.remove();
    }
    btn.append(mainSpan, subSpan);
  } else {
    btn.textContent = btnLabel;
  }

  const btnColor = buttonColorField.value;
  const btnTextColor = buttonTextColorField.value;
  if (btnColor) btn.style.setProperty('background-color', btnColor, 'important');
  if (btnTextColor) btn.style.setProperty('color', btnTextColor, 'important');
  right.append(btn);

  // Second button (optional — outline style)
  const btn2Label = button2TextField.value;
  const btn2Href = button2LinkField.value;
  if (btn2Label) {
    const btn2 = document.createElement(btn2Href ? 'a' : 'button');
    btn2.className = 'cta-card-1-button cta-card-1-button-secondary';
    if (btn2Href) btn2.href = btn2Href;
    if (!btn2Href) btn2.type = 'button';
    if (button2TextField.source) {
      moveInstrumentation(button2TextField.source, btn2);
      button2TextField.source.remove();
    }

    const btn2Subtext = button2SubtextField.value;
    if (btn2Subtext) {
      btn2.classList.add('has-subtext');
      const mainSpan = document.createElement('span');
      mainSpan.className = 'cta-card-1-button-main';
      mainSpan.textContent = btn2Label;
      const subSpan = document.createElement('span');
      subSpan.className = 'cta-card-1-button-subtext';
      subSpan.textContent = btn2Subtext;
      if (button2SubtextField.source) {
        moveInstrumentation(button2SubtextField.source, subSpan);
        button2SubtextField.source.remove();
      }
      btn2.append(mainSpan, subSpan);
    } else {
      btn2.textContent = btn2Label;
    }

    const btn2Color = button2ColorField.value;
    if (btn2Color) {
      // Variant 3 renders this button solid (no outline); other variants keep the border.
      if (styleType !== 'variant-3') {
        btn2.style.setProperty('border', `1px solid ${btn2Color}`, 'important');
      }
      btn2.style.setProperty('color', btn2Color, 'important');
    }
    const btn2BgColor = button2BackgroundColorField.value;
    btn2.style.setProperty('background-color', btn2BgColor || 'transparent', 'important');
    if (button2Location === 'left') left.append(btn2);
    else right.append(btn2);
  }

  // Clean up button2Link source
  removeOrHideField(block, button2LinkField.source, isEditor);

  // On the published page (no field instrumentation) the styleType select value
  // can leak into this slot via positional fallback — never render a bare
  // "variant-N" keyword as the below-button caption.
  if (/^variant-\d+$/i.test((belowButtonTextField.text || '').trim())) {
    belowButtonTextField.html = '';
    belowButtonTextField.source = null;
  }
  const belowText = buildRichTextElement('div', 'cta-card-1-below-button', belowButtonTextField);
  if (belowText) {
    if (button2Location === 'left') {
      right.classList.add('cta-card-1-right-inline');
      right.append(belowText);
    } else {
      right.append(belowText);
    }
  }

  // Clean up buttonLink source
  removeOrHideField(block, buttonLinkField.source, isEditor);

  // Rows hidden above (instead of removed) need to survive replaceChildren to stay
  // live-trackable by Universal Editor — collect them into a hidden archive appended
  // alongside the real content, matching cards.js / colored-icon-text.js / hero.js.
  const hiddenRows = [...block.querySelectorAll(':scope > div[hidden]')];
  if (hiddenRows.length) {
    const archive = document.createElement('span');
    archive.hidden = true;
    hiddenRows.forEach((row) => archive.append(row));
    block.replaceChildren(left, right, archive);
  } else {
    block.replaceChildren(left, right);
  }

  if (isEditor) {
    syncColors(block, styleType, leftColor, rightColor);
  }
}
