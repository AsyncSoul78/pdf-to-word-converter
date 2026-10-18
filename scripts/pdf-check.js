// Quick look inside a PDF before converting it: pages, password, real text or scanned pictures.
// Usage: node scripts/pdf-check.js <file.pdf> [more.pdf ...]
const fs = require('fs');
const zlib = require('zlib');

// Object streams hide page and font entries in compressed form, so unpack every stream we can.
function readable(buf) {
  const raw = buf.toString('latin1');
  const parts = [raw];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    try { parts.push(zlib.inflateSync(buf.subarray(start, end)).toString('latin1')); } catch { /* not deflate */ }
    re.lastIndex = end;
  }
  return parts.join('\n');
}

function check(buf) {
  const head = buf.toString('latin1', 0, 16);
  if (!head.startsWith('%PDF-')) return { pdf: false };
  const text = readable(buf);
  const count = re => (text.match(re) || []).length;
  const info = {
    pdf: true,
    version: head.slice(5, 8),
    pages: count(/\/Type\s*\/Page(?![a-zA-Z])/g),
    encrypted: /\/Encrypt\b/.test(text),
    fonts: count(/\/Type\s*\/Font\b/g),
    images: count(/\/Subtype\s*\/Image\b/g),
  };
  if (info.encrypted) info.verdict = 'password protected: type the password next to the file name';
  else if (info.fonts === 0 && info.images > 0) info.verdict = 'scanned pages: keep "Recognize scanned pages" on';
  else if (info.fonts > 0) info.verdict = 'real text: converts straight to editable paragraphs';
  else info.verdict = 'no text and no pictures found';
  return info;
}

if (require.main === module) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('usage: pdf-check.js <file.pdf> [more.pdf ...]'); process.exit(1); }
  for (const f of files) {
    const r = check(fs.readFileSync(f));
    if (!r.pdf) { console.log(`${f}: not a PDF`); continue; }
    console.log(`${f}: PDF ${r.version}, ${r.pages} page(s), ${r.fonts} font(s), ${r.images} picture(s)`);
    console.log(`  ${r.verdict}`);
  }
}

module.exports = { check };
