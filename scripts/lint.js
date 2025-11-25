#!/usr/bin/env node
const { JSHINT } = require('../tools/jshint');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const includeDirs = ['src', 'public', 'scripts'];
const ignore = new Set([
  'public/lib/epos-2.27.0.js',
  'tools/jshint.js'
]);

function listJsFiles(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(ROOT, full);
    if (ignore.has(rel)) continue;
    if (e.isDirectory()) {
      out.push(...listJsFiles(full));
    } else if (e.isFile() && full.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

const options = {
  esversion: 2021,
  node: true,
  browser: true,
  undef: true,
  unused: true,
  curly: true,
};

let errorCount = 0;
for (const dir of includeDirs) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const file of listJsFiles(abs)) {
    const src = fs.readFileSync(file, 'utf8');
    JSHINT(src, options);
    if (JSHINT.errors && JSHINT.errors.length) {
      console.log(`\n${path.relative(ROOT, file)}`);
      JSHINT.errors.forEach((err) => {
        if (!err) return;
        errorCount += 1;
        console.log(`  ${err.line}:${err.character}  ${err.reason}`);
      });
    }
  }
}

if (errorCount > 0) {
  console.error(`\nLint failed with ${errorCount} issue(s).`);
  process.exit(1);
} else {
  console.log('Lint passed.');
}
