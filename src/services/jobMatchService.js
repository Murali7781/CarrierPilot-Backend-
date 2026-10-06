const { pool } = require('../config/db');

function decodeJson(value, fallback = []) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function normalizeList(value) {
  const parsed = decodeJson(value, []);
  const source = Array.isArray(parsed) ? parsed : typeof parsed === 'string' ? parsed.split(/[,;|\n]/) : [];
  return [...new Map(source.map((item) => {
    const text = typeof item === 'string' ? item : item && typeof item === 'object' ? (item.name || item.skill || item.label || '') : '';
    const clean = String(text).trim().replace(/\s+/g, ' ');
    return [clean.toLocaleLowerCase(), clean];
  }).filter(([key]) => key)).values()];
}

function normalizeText(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(normalizeText).join(' ');
  if (typeof value === 'object') return Object.values(value).map(normalizeText).join(' ');
  const parsed = decodeJson(value, value);
  return typeof parsed === 'string' ? parsed : Array.isArray(parsed) || (parsed && typeof parsed === 'object') ? normalizeText(parsed) : String(parsed || '');
}

function containsTerm(text, term) {
  const words = term.toLocaleLowerCase().trim().split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  if (!words) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${words}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(text);
}

function ratioScore(matched, total) {
  return total ? Math.round((matched / total) * 100) : null;
}

async function analyzeResumeAgainstJob({ userId, resumeId, jobId, persist = true, resumeRecord = null, jobRecord = null }) {
  if (!resumeId || !jobId) {
    const error = new Error('resumeId and jobId are required');
    error.statusCode = 400;
    throw error;
  }

  let resume = resumeRecord;
  let job = jobRecord;
  if (!resume || !job) {
    const [[resumeRows], [jobRows]] = await Promise.all([
      pool.query('SELECT * FROM resumes WHERE id = ? AND user_id = ? LIMIT 1', [resumeId, userId]),
      pool.query('SELECT * FROM job_descriptions WHERE id = ? AND user_id = ? LIMIT 1', [jobId, userId]),
    ]);
    if (!resume && !resumeRows.length) { const error = new Error('Resume not found'); error.statusCode = 404; throw error; }
    if (!job && !jobRows.length) { const error = new Error('Job description not found'); error.statusCode = 404; throw error; }
    resume ||= resumeRows[0];
    job ||= jobRows[0];
  }
  const resumeSkills = normalizeList(resume.skills);
  const requiredSkills = normalizeList(job.required_skills);
  const preferredSkills = normalizeList(job.preferred_skills);
  const resumeText = [
    resume.professional_summary,
    resume.experience,
    resume.education,
    resume.skills,
    resume.projects,
    resume.certifications,
    resume.extracted_text,
  ].map(normalizeText).join(' ').toLocaleLowerCase();
  const requiredMatch = (skill) => resumeSkills.some((candidate) => candidate.toLocaleLowerCase() === skill.toLocaleLowerCase()) || containsTerm(resumeText, skill);
  const matchingSkills = requiredSkills.filter(requiredMatch);
  const missingSkills = requiredSkills.filter((skill) => !requiredMatch(skill));
  const matchingPreferredSkills = preferredSkills.filter(requiredMatch);
  const missingPreferredSkills = preferredSkills.filter((skill) => !requiredMatch(skill));
  const requiredCoverage = ratioScore(matchingSkills.length, requiredSkills.length);
  const preferredCoverage = ratioScore(matchingPreferredSkills.length, preferredSkills.length);
  const skillCoverage = requiredCoverage != null && preferredCoverage != null
    ? Math.round(requiredCoverage * 0.8 + preferredCoverage * 0.2)
    : requiredCoverage ?? preferredCoverage;

  const sections = {
    summary: Boolean(String(resume.professional_summary || '').trim()),
    experience: normalizeList(decodeJson(resume.experience, [])).length > 0 || Boolean(normalizeText(resume.experience).trim()),
    education: Boolean(normalizeText(resume.education).trim()),
    skills: resumeSkills.length > 0,
    projects: Boolean(normalizeText(resume.projects).trim()),
    certifications: Boolean(normalizeText(resume.certifications).trim()),
  };
  const presentSections = Object.values(sections).filter(Boolean).length;
  const completeness = Math.round((presentSections / Object.keys(sections).length) * 100);
  const atsScore = skillCoverage == null ? null : Math.round(skillCoverage * 0.75 + completeness * 0.25);
  const scoreBreakdown = {
    requiredSkillCoverage: requiredCoverage,
    preferredSkillCoverage: preferredCoverage,
    resumeCompleteness: completeness,
    sections,
    weights: { skillAlignment: 75, resumeCompleteness: 25 },
    scoreBasis: 'Estimate from job skill coverage and resume section completeness; not an employer ATS result or hiring prediction.',
  };
  const recommendations = [];
  if (missingSkills.length) recommendations.push(`For required skills missing from the resume: ${missingSkills.slice(0, 5).join(', ')}. Add them only if you can support them with real experience; otherwise treat them as learning gaps.`);
  if (missingPreferredSkills.length) recommendations.push(`Consider preferred skills where accurate: ${missingPreferredSkills.slice(0, 5).join(', ')}.`);
  if (!sections.summary) recommendations.push('Add a concise, role-specific professional summary based on your actual experience.');
  if (!sections.experience) recommendations.push('Add relevant employment, volunteer work, or practical experience with clear outcomes.');
  if (!sections.projects) recommendations.push('Add a relevant project if it demonstrates skills that are not evident in your work history.');
  if (atsScore == null) recommendations.push('This role has no structured required or preferred skill list, so a role-specific ATS-style score cannot be calculated yet. Add skills to the job description and compare again.');
  if (!recommendations.length) recommendations.push('The resume covers the listed skills and includes the main sections. Tailor the summary to this role and verify all claims before applying.');

  let matchId = null;
  if (persist) {
    const [result] = await pool.query(
      `INSERT INTO job_matches (user_id, resume_id, job_id, match_percentage, matching_skills, missing_skills, partial_skills, recommendations, ats_score, score_breakdown)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, resumeId, jobId, atsScore ?? 0, JSON.stringify(matchingSkills), JSON.stringify(missingSkills), JSON.stringify(matchingPreferredSkills), JSON.stringify(recommendations), atsScore, JSON.stringify(scoreBreakdown)],
    );
    matchId = result.insertId;
  }

  return {
    id: matchId,
    atsScore,
    matchPercentage: atsScore,
    requiredSkills,
    matchingSkills,
    missingSkills,
    preferredSkills,
    matchingPreferredSkills,
    missingPreferredSkills,
    scoreBreakdown,
    recommendations,
  };
}

module.exports = { analyzeResumeAgainstJob, normalizeList, containsTerm };
