# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue:

- **Email:** security@useguidon.com
- or use GitHub's [private vulnerability reporting](https://github.com/Two-Steps-Studio/guidon/security/advisories/new)

Include what you found, how to reproduce it and what an attacker could do with
it. We aim to reply within 7 days and will tell you when a fix is released. We
are happy to credit you, unless you prefer to stay anonymous.

Please don't access other people's data, run denial-of-service tests or use
automated scanners against useguidon.com. Test against your own self-hosted
instance instead (`./scripts/self-host.sh`).

## Supported versions

Fixes go into `main` and are deployed to Guidon Cloud. Self-hosted instances
get them by updating (see [docs/upgrading.md](./docs/upgrading.md)).
