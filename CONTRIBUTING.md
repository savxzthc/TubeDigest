# Contributing to TubeDigest

1. Fork the repository and create a focused branch.
2. Install dependencies with `npm install`.
3. Make the smallest complete change that solves the issue.
4. Add or update tests for behavior changes.
5. Run:

```bash
npm run typecheck
npm test
npm run build
```

Do not commit `.env`, API keys, transcript cache files, generated `dist` folders, or user data. Security issues should be reported privately as described in `SECURITY.md`.
