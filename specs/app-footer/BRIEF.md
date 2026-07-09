# Feature Brief: App footer (version + platform attribution)

- **Feature / behavior:** Every app page shows a small, muted footer with the app's
  live version (`v<X.Y.Z>`) and a "Powered by Mardash Forge" attribution.
- **Persisted state:** none. The version is read from `package.json` at build time.
- **Generic machinery touched:** the "Powered by Mardash Forge" attribution is
  platform-shaped (it's the platform's brand, not app domain). Everything else is
  pure app chrome.
- **My read (platform vs. domain):** version display = app-local (reads the app's own
  `package.json`). The attribution = platform-shaped, but cheap to ship as static text
  now and lift later.

## Orchestrator ruling (Gate 0)

- **Version display → app-local.** Build now.
- **"Powered by Mardash Forge" → platform-shaped, shipped app-local as static text now,**
  lifted to the platform later (tracked as capability **C17**). Structure it link-ready so
  the later lift is a one-line change.

Ruling honored: both built app-local in `./app`; attribution is static, link-ready.
No other platform-shaped machinery surfaced during the build (brief flag: none).
