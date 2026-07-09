export * from './types/db';
export * from './types/zod';    

export const GITHUB_URL_RE = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/

export const ALLOWED_EXTENSIONS = new Set([
    ".ts", ".tsx", ".mts",
    ".js", ".jsx", ".mjs",
])

export const SKIP_DIRS = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    "out",
    ".next",
    ".turbo",
    ".cache",
    "coverage",
    ".nyc_output",
])