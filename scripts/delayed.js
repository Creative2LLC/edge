// add delayed functionality here
import { initAnalytics } from './analytics.js';
import { decorateDonateLinks } from './classy-donate.js';

initAnalytics();

// Bind any authored links that point at a Classy checkout. The header binds its own
// Donate button during decoration; this catches donate links inside page content.
// Binding is local only, so the vendor SDK is still not fetched until someone clicks.
decorateDonateLinks(document);
