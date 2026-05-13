import decorateCodeAdamKit from '../code-adam-kit/code-adam-kit.js';

export default function decorate(block) {
  block.classList.add('code-adam-kit');
  decorateCodeAdamKit(block);
}
