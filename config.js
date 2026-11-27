// Ashbound staging build config. Not loaded by the live site.
// Live config.js is untouched (STAGING: false, VERSION: "v84k").
// Staging uses its own prefix so existing ashbound-staging: keys are left in place and unused.
// No secrets belong here.
// LOW_FX: true trims skill effects (fewer particles, no glow sprites) for slow phones; players can also pick Particles: Low.
self.ASHBOUND_CONFIG = { STAGING: true, VERSION: "v84n", STORAGE_PREFIX: "ashbound-staging-v71:", LOW_FX: false };
