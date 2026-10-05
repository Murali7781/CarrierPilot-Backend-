const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');

function parseList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id, name: user.name, email: user.email, mobile: user.mobile,
    targetRole: parseList(user.desired_roles)[0] || '',
    location: parseList(user.preferred_locations)[0] || '',
    workMode: parseList(user.work_modes)[0] || 'Any',
    created_at: user.created_at, updated_at: user.updated_at,
  };
}

async function getProfile(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.mobile, u.created_at, u.updated_at,
              p.desired_roles, p.preferred_locations, p.work_modes
       FROM users u LEFT JOIN candidate_preferences p ON p.user_id = u.id
       WHERE u.id = ? LIMIT 1`,
      [req.user.id],
    );
    if (!rows.length) return res.status(404).json(errorResponse('User profile not found.', 404));
    return res.status(200).json(successResponse('Profile retrieved successfully', { user: sanitizeUser(rows[0]) }));
  } catch (error) { next(error); }
}

async function updateProfile(req, res, next) {
  const body = req.body || {};
  const supportedFields = ['name', 'mobile', 'email', 'targetRole', 'location', 'workMode'];
  if (!supportedFields.some((field) => body[field] !== undefined)) return res.status(400).json(errorResponse('Provide at least one profile or preference field to update.', 400));

  const cleanText = (field, maxLength, { allowEmpty = true } = {}) => {
    if (body[field] === undefined) return undefined;
    if (typeof body[field] !== 'string') throw Object.assign(new Error(`${field} must be text.`), { statusCode: 400 });
    const value = body[field].trim();
    if ((!allowEmpty && !value) || value.length > maxLength) throw Object.assign(new Error(`${field} must contain ${allowEmpty ? 'at most' : '1 to'} ${maxLength} characters.`), { statusCode: 400 });
    return value;
  };

  let name; let mobile; let email; let targetRole; let location; let workMode;
  try {
    name = cleanText('name', 100, { allowEmpty: false });
    mobile = cleanText('mobile', 20);
    email = cleanText('email', 255, { allowEmpty: false })?.toLowerCase();
    targetRole = cleanText('targetRole', 150);
    location = cleanText('location', 200);
    workMode = cleanText('workMode', 20);
  } catch (error) { return res.status(error.statusCode || 400).json(errorResponse(error.message, error.statusCode || 400)); }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json(errorResponse('Please provide a valid email address.', 400));
  if (workMode && !['Any', 'Remote', 'Hybrid', 'On-site'].includes(workMode)) return res.status(400).json(errorResponse('Choose Any, Remote, Hybrid, or On-site for work mode.', 400));

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT u.id, u.name, u.email, u.mobile, u.created_at, u.updated_at,
              p.desired_roles, p.preferred_locations, p.work_modes
       FROM users u LEFT JOIN candidate_preferences p ON p.user_id = u.id
       WHERE u.id = ? LIMIT 1 FOR UPDATE`,
      [req.user.id],
    );
    if (!rows.length) { await connection.rollback(); return res.status(404).json(errorResponse('User profile not found.', 404)); }
    const current = rows[0];
    const nextEmail = email === undefined ? current.email : email;
    const nextName = name === undefined ? current.name : name;
    const nextMobile = mobile === undefined ? current.mobile : (mobile || null);
    if (email !== undefined) {
      const [duplicates] = await connection.query('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1', [nextEmail, req.user.id]);
      if (duplicates.length) { await connection.rollback(); return res.status(409).json(errorResponse('This email is already in use by another user.', 409)); }
    }
    if (name !== undefined || mobile !== undefined || email !== undefined) {
      await connection.query('UPDATE users SET name = ?, mobile = ?, email = ? WHERE id = ?', [nextName, nextMobile, nextEmail, req.user.id]);
    }
    if (targetRole !== undefined || location !== undefined || workMode !== undefined) {
      const desiredRoles = targetRole === undefined ? parseList(current.desired_roles) : (targetRole ? [targetRole] : []);
      const preferredLocations = location === undefined ? parseList(current.preferred_locations) : (location ? [location] : []);
      const workModes = workMode === undefined ? parseList(current.work_modes) : (workMode && workMode !== 'Any' ? [workMode] : []);
      await connection.query(
        `INSERT INTO candidate_preferences (user_id, desired_roles, preferred_locations, work_modes)
         VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE desired_roles = VALUES(desired_roles),
         preferred_locations = VALUES(preferred_locations), work_modes = VALUES(work_modes)`,
        [req.user.id, JSON.stringify(desiredRoles), JSON.stringify(preferredLocations), JSON.stringify(workModes)],
      );
    }
    await connection.commit();
    const [updated] = await pool.query(
      `SELECT u.id, u.name, u.email, u.mobile, u.created_at, u.updated_at,
              p.desired_roles, p.preferred_locations, p.work_modes
       FROM users u LEFT JOIN candidate_preferences p ON p.user_id = u.id WHERE u.id = ? LIMIT 1`,
      [req.user.id],
    );
    return res.status(200).json(successResponse('Profile updated successfully', { user: sanitizeUser(updated[0]) }));
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json(errorResponse('This email is already in use by another user.', 409));
    return next(error);
  } finally { connection.release(); }
}

module.exports = { getProfile, updateProfile };
