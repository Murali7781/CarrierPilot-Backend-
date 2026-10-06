const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= '127.0.0.1';
process.env.DB_USER ||= 'resume-parser-test';
process.env.DB_PASSWORD ||= 'resume-parser-test';
process.env.DB_NAME ||= 'resume_parser_test';
process.env.DB_PORT ||= '3306';

const { extractPdfText } = require('../src/services/resumeImportService');

function makeTextPdf(text) {
  const stream = `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  const chunks = [Buffer.from('%PDF-1.4\n', 'ascii')];
  const offsets = [0];
  let length = chunks[0].length;

  objects.forEach((object, index) => {
    offsets.push(length);
    const chunk = Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, 'ascii');
    chunks.push(chunk);
    length += chunk.length;
  });

  const xrefOffset = length;
  const entries = offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  chunks.push(Buffer.from(
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${entries}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
    'ascii',
  ));
  return Buffer.concat(chunks);
}

test('resume PDF extraction uses the shared PDF.js parser', async () => {
  const text = await extractPdfText(makeTextPdf('CareerPilot resume'));
  assert.match(text, /CareerPilot resume/);
});

test('resume PDF extraction rejects data that is not a PDF', async () => {
  await assert.rejects(
    extractPdfText(Buffer.from('not a PDF')),
    (error) => error.statusCode === 400 && /not a readable PDF/i.test(error.message),
  );
});
