import decorateCepReporting from '../community-education-partner-reporting/community-education-partner-reporting.js';

export default function decorate(block) {
  block.classList.add('cep-reporting');
  decorateCepReporting(block);
}
