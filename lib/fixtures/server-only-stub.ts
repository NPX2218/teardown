// Vitest stand-in for the real `server-only` package.
// Next.js resolves the published package, which throws in a client bundle.
// Unit tests import server modules directly, so this module is empty.
export {};
