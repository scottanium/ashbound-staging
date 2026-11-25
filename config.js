// Ashbound staging build config. Not loaded by the live site.
// Live config.js is untouched (STAGING: false, VERSION: "v79s").
// Staging uses its own prefix so existing ashbound-staging: keys are left in place and unused.
// No secrets belong here.
self.ASHBOUND_CONFIG = { STAGING: true, VERSION: "v79s", STORAGE_PREFIX: "ashbound-staging-v71:" };
