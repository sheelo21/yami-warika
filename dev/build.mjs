// Builds the deployable ../index.html from app.template.html by splicing in the
// qrcode-generator library source at the /*__QRCODE_GENERATOR_LIBRARY__*/ marker.
//
// Usage (from dev/):
//   npm install
//   node build.mjs
//
// This has to run after any edit to app.template.html — index.html at the repo
// root is a plain static file with no build step of its own; Vercel (and any
// other static host) serves it as-is.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(here, 'app.template.html');
const libPath = path.join(here, 'node_modules/qrcode-generator/dist/qrcode.js');
const outPath = path.join(here, '..', 'index.html');

const tpl = fs.readFileSync(templatePath, 'utf8');
const lib = fs.readFileSync(libPath, 'utf8');

const marker = '/*__QRCODE_GENERATOR_LIBRARY__*/';
if (!tpl.includes(marker)) {
  console.error('Marker not found in app.template.html — nothing to splice.');
  process.exit(1);
}

// Function replacer (not a string replacer!) — avoids $&/$`/$'/$$ special-sequence
// corruption when the replacement text is ~50KB of arbitrary library source.
const out = tpl.replace(marker, function () { return lib; });

fs.writeFileSync(outPath, out);
console.log('Built ' + outPath + ' (' + out.length + ' bytes).');
