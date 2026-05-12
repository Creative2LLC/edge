import decoratePosterApiRegistration from '../missing-child-poster-api-registration/missing-child-poster-api-registration.js';

export default function decorate(block) {
  block.classList.add('missing-child-poster-api-registration');
  decoratePosterApiRegistration(block);
}
