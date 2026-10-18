// Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const zlib = require('zlib');
const { check } = require('../scripts/pdf-check');
const { stats } = require('../scripts/docx-stats');

function pdf(body) {
  return Buffer.from(`%PDF-1.7\n${body}\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`, 'latin1');
}

// Stored (uncompressed) or deflated ZIP with the given files.
function zip(files, deflate) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content, 'utf8');
    const data = deflate ? zlib.deflateRawSync(raw) : raw;
    const n = Buffer.from(name, 'utf8');
    const crc = zlib.crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(deflate ? 8 : 0, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(deflate ? 8 : 0, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(n.length, 28);
    ch.writeUInt32LE(offset, 42);
    locals.push(lh, n, data); centrals.push(ch, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

test('PDF with fonts is real text', () => {
  const r = check(pdf('1 0 obj << /Type /Pages /Count 2 >> endobj 2 0 obj << /Type /Page >> endobj 3 0 obj << /Type /Page >> endobj 4 0 obj << /Type /Font /Subtype /Type1 >> endobj'));
  assert.strictEqual(r.pages, 2);
  assert.strictEqual(r.fonts, 1);
  assert.match(r.verdict, /real text/);
});

test('PDF with only pictures is a scan', () => {
  const r = check(pdf('1 0 obj << /Type /Page >> endobj 2 0 obj << /Type /XObject /Subtype /Image >> endobj'));
  assert.strictEqual(r.fonts, 0);
  assert.match(r.verdict, /scanned/);
});

test('entries packed in a compressed stream are found', () => {
  const packed = zlib.deflateSync(Buffer.from('<< /Type /Page >> << /Type /Font >>'));
  const buf = Buffer.concat([Buffer.from('%PDF-1.5\n1 0 obj << /Type /ObjStm >> stream\n', 'latin1'), packed, Buffer.from('\nendstream endobj\n%%EOF', 'latin1')]);
  const r = check(buf);
  assert.strictEqual(r.pages, 1);
  assert.strictEqual(r.fonts, 1);
});

test('password protected PDF is reported', () => {
  assert.match(check(pdf('1 0 obj << /Type /Page >> endobj trailer << /Encrypt 5 0 R >>')).verdict, /password/);
});

test('DOCX stats count paragraphs, tables and pictures', () => {
  const xml = '<w:document><w:body>' +
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Bake sale</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t xml:space="preserve">Cakes and cookies for everyone</w:t></w:r></w:p>' +
    '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Price</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
    '<w:p><w:r><w:drawing></w:drawing></w:r></w:p>' +
    '</w:body></w:document>';
  for (const deflate of [false, true]) {
    const s = stats(zip({ '[Content_Types].xml': '<Types/>', 'word/document.xml': xml }, deflate));
    assert.deepStrictEqual(s, { paragraphs: 4, words: 8, headings: 1, tables: 1, pictures: 1 });
  }
});
