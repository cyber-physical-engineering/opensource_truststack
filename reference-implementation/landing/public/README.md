Branding assets directory.

Notes:
- The landing page header shows BDP branding (purple) and can optionally display a CyberActa logo on the right.
  - Title: "TrustStack™ Suite"
  - Subtext: "HealthSec Alliance"
- The favicon is generated dynamically by the server as a purple square with a white "H" at `/favicon.svg`.
- Optional assets you can drop in (no code changes required):
  - `logo.svg` — BDP square mark. Served at `/logo.svg` (already provided dynamically if absent).
  - `cyberacta-logo.png` — CyberActa logo with a white background. Served at `/cyberacta-logo.png`.
    - If this file is missing, the header will quietly omit the partner logo (no broken image).
- Files in this folder are served at the web root (e.g., `/logo.svg`).

FAQs (credentials):
- A lightweight FAQs server is included and exposed on host port `3034`.
- Open `http://localhost:3034` to view default demo credentials (OpenObserve).

