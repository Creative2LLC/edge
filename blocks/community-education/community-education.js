import decorateCepReporting from '../community-education-partner-reporting/community-education-partner-reporting.js';

export default function decorate(block) {
  block.classList.add('community-education-partner-reporting');
  decorateCepReporting(block);
}
