## Security Policy

### Reporting
If you believe you’ve found a security issue, please **do not** open a public issue with details.
Contact the maintainers privately.

### No Secrets in Repo
This repository is intended to contain **no production secrets**.

- Local environment files like `.env` are ignored via `.gitignore`.
- Demo defaults (e.g., `ChangeMe!123`) may exist for local-only Docker demos; treat them as **unsafe for production**.

### Demo Disclaimer
The reference implementation under `reference-implementation/` is a **demo stack**.
If you deploy anything publicly, you must:
- rotate all credentials
- enable TLS
- restrict network exposure
- review logs/telemetry retention

