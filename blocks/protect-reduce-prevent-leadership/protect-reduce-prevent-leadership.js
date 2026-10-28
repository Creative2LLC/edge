import decoratePrplApplication from '../prpl-application/prpl-application.js';

export default function decorate(block) {
  block.classList.add('prpl-application');
  decoratePrplApplication(block);
}
