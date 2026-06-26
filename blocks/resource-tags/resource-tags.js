// Metadata-only block — renders nothing visible on the live page.
// Authors edit taxonomy fields via the Universal Editor sidebar.
export default function decorate(block) {
  block.hidden = true;
}
