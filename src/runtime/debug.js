const env = typeof process !== 'undefined' && process?.env ? process.env : {};

export function debugFlag(name) {
  return !!env[name];
}

export const DBG = {
  npe: debugFlag('DBG_NPE'),
  gd: debugFlag('DBG_GD'),
  exc: debugFlag('DBG_EXC'),
  codeOff: debugFlag('DBG_CODEOFF'),
  traceToolbar: debugFlag('DBG_TRACE_TOOLBAR'),
  layout: debugFlag('DBG_LAYOUT'),
  missing: debugFlag('DBG_MISSING'),
  noThemeApply: env.NO_THEME_APPLY === '1',
};
