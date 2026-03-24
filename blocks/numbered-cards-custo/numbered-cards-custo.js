import decorateNumberedCardsCustom from '../numbered-cards-custom/numbered-cards-custom.js';

export default function decorate(block) {
  block.classList.add('numbered-cards-custom');
  return decorateNumberedCardsCustom(block);
}
