# Changelog

## 1.1.1

- Fixed TypeScript types for CommonJS consumers: `require` now resolves `dist/index.d.cts` instead of the ESM declarations ("masquerading as ESM" under `node16`/`nodenext`).
- Exposed `./package.json` in the exports map.

## 1.1.0

- Upgraded Sharp to 0.35.5.
- Raised the minimum supported Node.js version to 20.9 (Node 18 is end-of-life).
- Upgraded dev tooling (Vitest 5, TypeScript 5.9, tsup 8.5) and resolved all audit advisories.
- CI now tests on Node 22 and 24 and smoke-tests the packed package on Node 20.

## 1.0.3

- Upgraded Sharp to include current security fixes.

## 1.0.2

- Expanded API documentation and documented limitations.

## 1.0.0

- Documented package metadata and release baseline.
