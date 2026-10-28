import decorateFaonApplication from '../faon-application/faon-application.js';

export default function decorate(block) {
  block.classList.add('faon-application');
  decorateFaonApplication(block);
}
