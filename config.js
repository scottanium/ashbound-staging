// Ashbound build config - the only file that differs between live and staging.
// Live site (scottanium.github.io/ashbound/):          STAGING: true
// Staging site (scottanium.github.io/ashbound-staging/): STAGING: true
// Staging stores saves/settings under the "ashbound-staging:" prefix and uses its own service-worker cache,
// so staging can never overwrite or delete live saves or the live offline cache. No secrets belong here.
self.ASHBOUND_CONFIG = { STAGING: true, VERSION: "v69", STORAGE_PREFIX: "ashbound-staging:" };
