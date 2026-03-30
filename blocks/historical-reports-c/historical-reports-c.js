import decorateHistoricalReportsCarousel from '../historical-reports-carousel/historical-reports-carousel.js';

export default function decorate(block) {
  block.classList.add('historical-reports-carousel');
  return decorateHistoricalReportsCarousel(block);
}
