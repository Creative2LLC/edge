import decorateGeoReport from '../cybertipline-geo-report/cybertipline-geo-report.js';

export default async function decorate(block) {
  block.classList.add('cybertipline-geo-report');
  await decorateGeoReport(block);
}
