// Counts what ended up in a Word file: paragraphs, words, headings, tables, pictures.
// Handy for comparing a converted DOCX with the original PDF.
// Usage: node scripts/docx-stats.js <file.docx> [--json]
const fs = require('fs');
const zlib = require('zlib');

// Minimal ZIP reader: finds one entry through the central directory.
function readEntry(buf, name) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a ZIP/DOCX file');
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const entry = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (entry === name) {
      const data = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const body = buf.subarray(data, data + size);
      if (method === 0) return body;
      if (method === 8) return zlib.inflateRawSync(body);
      throw new Error(`unsupported compression ${method}`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function stats(buf) {
  const doc = readEntry(buf, 'word/document.xml');
  if (!doc) throw new Error('word/document.xml not found');
  const xml = doc.toString('utf8');
  const text = (xml.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(' ');
  return {
    paragraphs: (xml.match(/<w:p[\s>]/g) || []).length,
    words: (text.match(/\S+/g) || []).length,
    headings: (xml.match(/<w:pStyle w:val="Heading\d"/g) || []).length,
    tables: (xml.match(/<w:tbl>/g) || []).length,
    pictures: (xml.match(/<w:drawing>/g) || []).length,
  };
}

if (require.main === module) {
  const [file, flag] = process.argv.slice(2);
  if (!file) { console.error('usage: docx-stats.js <file.docx> [--json]'); process.exit(1); }
  const s = stats(fs.readFileSync(file));
  if (flag === '--json') console.log(JSON.stringify(s));
  else console.log(`${file}: ${s.paragraphs} paragraphs, ${s.words} words, ${s.headings} headings, ${s.tables} tables, ${s.pictures} pictures`);
}

module.exports = { stats, readEntry };
