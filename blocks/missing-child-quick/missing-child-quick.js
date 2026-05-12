import decorateQuickReport from '../missing-child-quick-report/missing-child-quick-report.js';

export default function decorate(block) {
  block.classList.add('missing-child-quick-report');
  decorateQuickReport(block);
}
