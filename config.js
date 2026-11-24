// Ashbound staging build config. Not loaded by the live site.
// Live config.js is untouched (STAGING: false, VERSION: "v75").
// Staging uses its own prefix so existing ashbound-staging: keys are left in place and unused.
// No secrets belong here.
self.ASHBOUND_CONFIG = { STAGING: true, VERSION: "v75", STORAGE_PREFIX: "ashbound-staging-v71:" };
