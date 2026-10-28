/*
 * ============================================================================
 * ANALYTICS CONFIG — the only file you edit to switch analytics on.
 * ============================================================================
 *
 * Everything ships OFF. With `enabled: false` nothing is fetched, no tag runs,
 * no cookie is written, no beacon leaves the browser — so the redesign cannot
 * put test traffic into a live report suite while it is being built.
 *
 * TO GO LIVE
 *   1. paste the real IDs below (they are all empty on purpose)
 *   2. flip the tool's own `enabled` to true
 *   3. flip the master `enabled` to true
 *
 * A tag only ever runs when ALL FIVE of these agree:
 *   master enabled  ->  tool enabled  ->  ID present  ->  host allowed  ->  consent granted
 *
 * TO REHEARSE WITHOUT SENDING ANYTHING
 *   add ?analytics-debug=1 to any URL. Every tag load and event is logged to the
 *   console with the reason it would or would not fire, and nothing is loaded.
 *   Works whether or not the config is enabled — use it to prove the wiring is
 *   right before you point it at the client's live properties.
 *
 * IDs FROM THE LEGACY SITE (aem-c2-copy), for reference when cutting over.
 * Deliberately NOT filled in — confirm with the client which carry over:
 *   GTM container        GTM-T3HWMDL
 *   GA4                  G-JGSFP8TSBM        (configure inside GTM, not here)
 *   Google Ads           AW-1064982595       (donate conversion NHbTCOTlyoQBEMOw6fsD)
 *   Meta Pixel           1698387943710186    (configure inside GTM, not here)
 *   Adobe Launch         property 13263c844364
 *     base path          //assets.adobedtm.com/13263c844364/0cd74409da0d/
 *     production         launch-94cc6ff83d13.min.js
 *     staging            launch-ea7df0fa67cd-staging.min.js
 *     development        launch-22dadedfc0eb-development.min.js
 */

const config = {
  /**
   * MASTER SWITCH. While false, this module does nothing at all.
   * This is the last thing you flip when cutting over from the legacy site.
   */
  enabled: false,

  /**
   * Hosts allowed to send real data. Anything else — .aem.page / .aem.live previews,
   * the AEM author instance, localhost — is treated as non-production.
   *
   * This is the guard that stops a correctly-configured production ID from being
   * fired off a preview URL and polluting the client's numbers. Leave it alone.
   */
  productionHosts: ['ncmec.org', 'www.ncmec.org'],

  /**
   * Set true ONLY to smoke-test real tags from a preview host. Expect the traffic
   * to show up in the client's reporting. Put it back to false immediately after.
   */
  allowNonProductionHosts: false,

  /**
   * Google Tag Manager. One container; GA4, Google Ads and Meta Pixel are all
   * configured inside it by the marketing team, so adding or retiring a tag never
   * needs a code change here.
   *
   * The site's job is to load the container under consent and push a clean,
   * documented dataLayer for GTM triggers to read. See EVENTS in analytics.js.
   */
  gtm: {
    enabled: false,
    containerId: '', // 'GTM-XXXXXXX'

    /**
     * Which consent category must be granted before the container loads.
     * Advertising tags inside the container are separately gated by Google
     * Consent Mode (ad_storage / ad_user_data / ad_personalization), which this
     * site drives from the Marketing toggle in the cookie banner.
     */
    consentCategory: 'analytics',

    /**
     * Consent Mode v2 mode.
     *   false (default) = "Basic": the container is not loaded until consent is
     *                     granted. Nothing reaches Google before the visitor agrees.
     *   true            = "Advanced": the container loads immediately with all
     *                     consent defaulted to denied, so Google receives cookieless
     *                     pings it can use for conversion modelling. Better ad
     *                     measurement, but it does contact Google pre-consent.
     * Ask the client's privacy counsel before switching this on.
     */
    loadBeforeConsent: false,
  },

  /**
   * Adobe Analytics via Adobe Launch (Tags). The site loads the environment's embed
   * and feeds window.adobeDataLayer (Adobe Client Data Layer); the client's existing
   * Launch rules read from there.
   *
   * Per-environment embeds matter: a preview host resolves to `development`, so
   * rehearsal traffic never lands in the production report suite even after go-live.
   */
  adobe: {
    enabled: false,
    consentCategory: 'analytics',
    embeds: {
      production: '',
      staging: '',
      development: '',
    },
  },

  /**
   * Params allowed to leave the browser, per event. Anything not listed is dropped
   * before it reaches any tag — this is what keeps names, emails and organizations
   * out of GTM and Adobe when a block passes a whole object by mistake.
   *
   * Add keys here deliberately; do not widen it to pass an object through.
   */
  allowedParams: [
    'audience',
    'campaign_id',
    'file_extension',
    'file_name',
    'form_name',
    'gated',
    'link_domain',
    'link_url',
    'page_location',
    'page_path',
    'page_title',
    'resource_slug',
    'search_term',
    'video_title',
  ],
};

export default config;
