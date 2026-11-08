const env = typeof process !== 'undefined' && process?.env ? process.env : {};

export function debugFlag(name) {
  return !!env[name];
}

export const DBG = {
  npe: debugFlag('DBG_NPE'),
  exc: debugFlag('DBG_EXC'),
  missing: debugFlag('DBG_MISSING'),
  noThemeApply: env.NO_THEME_APPLY === '1',
};
