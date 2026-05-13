import decorateEventRequestForm from '../event-request-form/event-request-form.js';

export default function decorate(block) {
  block.classList.add('event-request-form');
  decorateEventRequestForm(block);
}
