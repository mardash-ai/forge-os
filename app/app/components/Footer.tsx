import { APP_VERSION } from '@/lib/version';

// Site-wide footer for forge-os's OWN (auth-gated) pages — a muted telemetry row in
// the forge-floor aesthetic: the live app version + a platform attribution. Signed-out
// /auth/* pages are platform-served (proxied same-origin) and never hit this layout, so
// this footer is intentionally the app's own chrome, not a platform-served surface.
//
// The version comes from package.json (see lib/version.ts) so it tracks every
// /commit-code bump automatically — no number is hardcoded.
//
// "Powered by Mardash Forge" is STATIC TEXT for now: the Mardash marketing site isn't
// built yet. The brand label is isolated in its own element (`.footer-brand`) so turning
// it into a real link later is a one-line change — swap the <span> for
// `<a className="footer-brand" href="https://…">Mardash Forge</a>`. Lifting this
// attribution to the platform is tracked as platform capability C17.
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span className="footer-version">v{APP_VERSION}</span>
        <span className="footer-sep" aria-hidden="true">
          ·
        </span>
        <span className="footer-attribution">
          Powered by <span className="footer-brand">Mardash Forge</span>
        </span>
      </div>
    </footer>
  );
}
