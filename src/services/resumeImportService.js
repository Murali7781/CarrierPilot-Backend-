const path = require('node:path');
const { pool } = require('../config/db');
const { createImportedResume } = require('./resumeService');

const MAX_PDF_PAGES = 20;
const MAX_EXTRACTED_CHARACTERS = 80000;
const sectionAliases = {
  summary: /^(professional\s+summary|summary|profile|career\s+objective|objective)$/i,
  experience: /^(work\s+experience|professional\s+experience|experience|employment(?:\s+history)?)$/i,
  education: /^(education|academic\s+background|qualifications)$/i,
  skills: /^(skills|technical\s+skills|core\s+competencies|competencies)$/i,
  projects: /^(projects|personal\s+projects|selected\s+projects)$/i,
  certifications: /^(certifications|certificates|licenses|licences)$/i,
};

function badRequest(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function cleanExtractedText(value) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/[\t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_EXTRACTED_CHARACTERS);
}

function detectSections(lines) {
  const found = {};
  const markers = [];
  lines.forEach((line, index) => {
    const heading = line.replace(/[:|]+$/, '').trim();
    const inlineHeading = line.match(/^([^:：]{2,40})\s*[:：]\s*(.+)$/);
    const candidateHeadings = [heading, ...(inlineHeading ? [inlineHeading[1].trim()] : [])];
    for (const [section, matcher] of Object.entries(sectionAliases)) {
      const matchedHeading = candidateHeadings.find((candidate) => matcher.test(candidate));
      if (matchedHeading) {
        markers.push({ section, index, inline: matchedHeading === heading ? '' : inlineHeading?.[2]?.trim() || '' });
        break;
      }
    }
  });
  markers.forEach((marker, index) => {
    const next = markers[index + 1]?.index ?? lines.length;
    found[marker.section] = [...(found[marker.section] || []), [marker.inline, lines.slice(marker.index + 1, next).join('\n')].filter(Boolean).join('\n').trim()].filter(Boolean).join('\n');
  });
  return found;
}

function parseResumeText(text, originalName) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const sections = detectSections(lines);
  const sectionStart = lines.findIndex((line) => Object.values(sectionAliases).some((matcher) => matcher.test(line.replace(/[:|]+$/, '').trim())));
  const headingLines = lines.slice(0, sectionStart < 0 ? Math.min(8, lines.length) : sectionStart);
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
  const phone = text.match(/(?:\+?\d[\d ()-]{7,}\d)/)?.[0]?.trim() || '';
  const linkedin = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s|]+/i)?.[0]?.replace(/[),.;]+$/, '') || '';
  const nameLine = headingLines.find((line) => !line.includes('@') && !/linkedin|resume|curriculum vitae/i.test(line) && /^[\p{L}][\p{L} .'’\-]{1,118}$/u.test(line));
  const safeOriginalName = String(originalName || 'Imported resume.pdf').split(/[\\/]/).pop();
  const fileTitle = path.parse(safeOriginalName).name
    .replace(/[^\p{L}\p{N} ._-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140) || 'Imported resume';
  const title = `${fileTitle} (imported)`.slice(0, 150);
  const skillText = sections.skills || '';
  const skills = [...new Set(skillText.split(/[\n,;|•·]+/).map((skill) => skill.replace(/^[\s\-*]+|[\s\-*]+$/g, '').trim()).filter((skill) => skill.length >= 2 && skill.length <= 100))].slice(0, 50);
  const summary = sections.summary || '';
  return {
    title,
    personal_info: {
      full_name: (nameLine || '').slice(0, 120),
      email: email.slice(0, 255),
      phone: phone.slice(0, 30),
      linkedin: linkedin.slice(0, 500),
    },
    professional_summary: summary.slice(0, 5000),
    experience: (sections.experience ? [{ title: 'Imported experience — review and split into roles', description: sections.experience.slice(0, 4000) }] : []),
    education: (sections.education ? [{ degree: '', institution: '', details: sections.education.slice(0, 3000) }] : []),
    skills,
    projects: (sections.projects ? [{ name: 'Imported projects — review and split', description: sections.projects.slice(0, 3000) }] : []),
    certifications: (sections.certifications ? [{ name: sections.certifications.slice(0, 200) }] : []),
  };
}

async function extractPdfText(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw badRequest('This file is not a readable PDF. Choose a text-based PDF and try again.');
  }
  let loadingTask;
  try {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    loadingTask = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false });
    const document = await loadingTask.promise;
    try {
      if (document.numPages > MAX_PDF_PAGES) throw badRequest(`PDFs can contain at most ${MAX_PDF_PAGES} pages. Split the file and import the relevant pages.` , 413);
      const pages = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        let line = '';
        const lines = [];
        for (const item of content.items) {
          if (typeof item.str !== 'string') continue;
          line += item.str;
          if (item.hasEOL) { if (line.trim()) lines.push(line.trim()); line = ''; }
          else line += ' ';
        }
        if (line.trim()) lines.push(line.trim());
        pages.push(lines.join('\n'));
      }
      return cleanExtractedText(pages.join('\n\n'));
    } finally { await document.destroy(); }
  } catch (error) {
    if (error.statusCode) throw error;
    throw badRequest('CareerPilot could not read this PDF. If it is a scanned image, run OCR first, then import the searchable PDF.');
  } finally {
    if (loadingTask) await loadingTask.destroy().catch(() => {});
  }
}

async function importResumePdf(userId, file) {
  if (!file?.buffer) throw badRequest('Choose a PDF file to import.');
  const extractedText = await extractPdfText(file.buffer);
  if (extractedText.length < 80) throw badRequest('This PDF has little or no selectable text. Run OCR on the scanned document and import it again.');
  const sourceFileName = String(file.originalname || 'resume.pdf').split(/[\\/]/).pop().replace(/[\u0000-\u001f]/g, '_').slice(0, 255);
  const payload = parseResumeText(extractedText, sourceFileName);
  if (!payload.personal_info.full_name || !payload.personal_info.email) {
    const [users] = await pool.query('SELECT name, email, mobile FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!users.length) throw badRequest('Your account profile could not be loaded to complete resume contact details.');
    payload.personal_info.full_name ||= users[0].name || '';
    payload.personal_info.email ||= users[0].email || '';
    payload.personal_info.phone ||= users[0].mobile || '';
  }
  if (!payload.personal_info.full_name || !payload.personal_info.email) {
    throw badRequest('CareerPilot could not find contact details in the PDF or account profile. Add your name and email to your profile before importing.');
  }
  const resume = await createImportedResume(userId, { payload, sourceFileName, extractedText });
  return { resume, extractedCharacters: extractedText.length, note: 'The PDF was parsed and its extracted text was saved. Review every field and correct parsing errors before using the resume.' };
}

module.exports = { importResumePdf, extractPdfText, parseResumeText };
