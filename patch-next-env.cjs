// Patch @next/env default export for tsx CJS/ESM interop
// Payload's loadEnv.js does: import nextEnvImport from '@next/env'
// then: const { loadEnvConfig } = nextEnvImport
// In tsx, the default import doesn't unwrap CJS exports correctly.
const nextEnv = require('@next/env')
const Module = require('module')
const origResolve = Module._resolveFilename

// Override require('@next/env') to return a module whose .default has loadEnvConfig
const origLoad = Module._cache
const resolvedPath = require.resolve('@next/env')

// Patch the cached module to include a .default property
const cachedModule = require.cache[resolvedPath]
if (cachedModule && !cachedModule.exports.default) {
  cachedModule.exports.default = cachedModule.exports
}
