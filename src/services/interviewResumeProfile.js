function decode(value, fallback = []) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeEntries(value) {
  const decoded = decode(value, []);
  if (Array.isArray(decoded)) return decoded.filter((entry) => entry && typeof entry === 'object');
  if (decoded && typeof decoded === 'object') return [decoded];
  return [];
}

function normalizeSkills(value, skillEntries) {
  const decoded = decode(value, []);
  const source = Array.isArray(decoded)
    ? decoded
    : typeof decoded === 'string'
      ? decoded.split(/[,;|\n]/)
      : [];
  const storedSkills = Array.isArray(skillEntries) ? skillEntries.map((entry) => entry?.skill_name) : [];
  return [...new Map([...source, ...storedSkills]
    .filter((skill) => typeof skill === 'string' && skill.trim())
    .map((skill) => [skill.trim().toLowerCase(), skill.trim()])).values()].slice(0, 50);
}

function textOf(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join(' ');
  if (typeof value === 'object') return Object.values(value).map(textOf).filter(Boolean).join(' ');
  return String(value).trim();
}

function redactContactDetails(value) {
  return String(value || '')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, '[phone]')
    .replace(/https?:\/\/\S+/gi, '[link]');
}

function dateToMonth(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const match = /^(\d{4})-(\d{1,2})/.exec(text);
  if (match) {
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) return Number(match[1]) * 12 + month - 1;
  }
  const year = /^(\d{4})$/.exec(text);
  return year ? Number(year[1]) * 12 : null;
}

function estimateExperienceYears(experience, now = new Date()) {
  const currentMonth = now.getFullYear() * 12 + now.getMonth();
  const ranges = experience.map((entry) => {
    const start = dateToMonth(entry.start_date);
    const endDate = String(entry.end_date || '').trim();
    const end = /^(present|current|now)$/i.test(endDate)
      ? currentMonth
      : dateToMonth(endDate);
    return start != null && end >= start ? [start, end] : null;
  }).filter(Boolean).sort((left, right) => left[0] - right[0]);

  if (!ranges.length) return null;
  let months = 0;
  let [rangeStart, rangeEnd] = ranges[0];
  for (const [start, end] of ranges.slice(1)) {
    if (start <= rangeEnd + 1) rangeEnd = Math.max(rangeEnd, end);
    else {
      months += rangeEnd - rangeStart + 1;
      [rangeStart, rangeEnd] = [start, end];
    }
  }
  months += rangeEnd - rangeStart + 1;
  return Math.round((months / 12) * 10) / 10;
}

function experienceLevel(years, experience, projects) {
  if (years != null) {
    if (years < 2) return 'Early-career; assess fundamentals and ownership at the documented experience level.';
    if (years < 5) return 'Intermediate; assess independent delivery, trade-offs, and debugging.';
    return 'Experienced; assess architecture, prioritization, mentoring, and production decisions.';
  }
  if (experience.length) return 'Experience is listed, but dates do not support a reliable years estimate; calibrate to the documented responsibilities.';
  if (projects.length) return 'Project-led experience; assess fundamentals and practical project decisions without assuming professional tenure.';
  return 'Experience level is not established by the resume; begin with role-relevant fundamentals and use realistic scenarios.';
}

function createInterviewResumeProfile(resume = {}) {
  const experience = normalizeEntries(resume.experience);
  const education = normalizeEntries(resume.education);
  const projects = normalizeEntries(resume.projects);
  const certifications = normalizeEntries(resume.certifications);
  const skills = normalizeSkills(resume.skills, resume.skill_entries);
  const extractedText = redactContactDetails(resume.extracted_text).slice(0, 12000);
  const summary = redactContactDetails(resume.professional_summary).slice(0, 3000);
  const experienceYears = estimateExperienceYears(experience);

  return {
    resumeTitle: String(resume.title || '').slice(0, 150),
    summary,
    skills,
    experienceYears,
    experienceLevel: experienceLevel(experienceYears, experience, projects),
    experience: experience.slice(0, 12).map((entry) => ({
      title: textOf(entry.title).slice(0, 160),
      company: textOf(entry.company).slice(0, 160),
      dates: [textOf(entry.start_date), textOf(entry.end_date)].filter(Boolean).join(' – ').slice(0, 40),
      description: redactContactDetails(textOf(entry.description)).slice(0, 1400),
    })),
    education: education.slice(0, 8).map((entry) => ({
      degree: textOf(entry.degree).slice(0, 200),
      institution: textOf(entry.institution).slice(0, 200),
      details: redactContactDetails(textOf(entry.details)).slice(0, 700),
    })),
    projects: projects.slice(0, 10).map((entry) => ({
      name: textOf(entry.name).slice(0, 180),
      technologies: textOf(entry.technologies).slice(0, 400),
      description: redactContactDetails(textOf(entry.description)).slice(0, 1200),
    })),
    certifications: certifications.slice(0, 10).map((entry) => ({
      name: textOf(entry.name).slice(0, 200),
      issuer: textOf(entry.issuer).slice(0, 150),
    })),
    additionalResumeText: extractedText,
    evidenceCounts: {
      skills: skills.length,
      experience: experience.length,
      education: education.length,
      projects: projects.length,
      certifications: certifications.length,
      hasSummary: Boolean(summary),
      hasExtractedText: Boolean(extractedText),
    },
  };
}

module.exports = { createInterviewResumeProfile, estimateExperienceYears };
