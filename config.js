// Ashbound staging build config. Not loaded by the live site.
// Live config.js is untouched (STAGING: false, VERSION: "v84j").
// Staging uses its own prefix so existing ashbound-staging: keys are left in place and unused.
// No secrets belong here.
self.ASHBOUND_CONFIG = { STAGING: true, VERSION: "v84j", STORAGE_PREFIX: "ashbound-staging-v71:" };
