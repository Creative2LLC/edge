import decorateReprintRequest from '../ncmec-reprint-request/ncmec-reprint-request.js';

export default function decorate(block) {
  block.classList.add('ncmec-reprint-request');
  decorateReprintRequest(block);
}
