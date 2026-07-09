import pkg from '../package.json';

/**
 * The app's SemVer version — read from `package.json`, the single source of truth
 * that `/commit-code` bumps (and that the `CHANGELOG.md` headings track).
 *
 * The import is static, so Next inlines this at build time: it is correct in the
 * built/standalone app, not just under `next dev`, and stays in sync with future
 * version bumps automatically. NEVER hardcode a version number here.
 */
export const APP_VERSION: string = pkg.version;
