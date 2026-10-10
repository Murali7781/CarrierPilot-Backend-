const { errorResponse } = require('../utils/response');

const rolePermissions = Object.freeze({
  candidate: Object.freeze([
    'applications.create',
    'applications.delete',
    'applications.update',
    'applications.view',
    'dashboard.view',
    'interviews.create',
    'interviews.manage',
    'interviews.view',
    'jobs.create',
    'jobs.delete',
    'jobs.update',
    'jobs.view',
    'matches.analyze',
    'matches.view',
    'preferences.update',
    'preferences.view',
    'profile.update',
    'profile.view',
    'resumes.create',
    'resumes.delete',
    'resumes.update',
    'resumes.view',
    'savedJobs.manage',
    'savedJobs.view',
    'skills.view',
    'ai.chat',
    'ai.resumeReview',
    'ai.status',
  ]),
  recruiter: Object.freeze([
    'jobs.create',
    'jobs.delete',
    'jobs.update',
    'jobs.view',
    'profile.update',
    'profile.view',
  ]),
  admin: Object.freeze([
    'applications.create',
    'applications.delete',
    'applications.update',
    'applications.view',
    'dashboard.view',
    'interviews.create',
    'interviews.manage',
    'interviews.view',
    'jobs.create',
    'jobs.delete',
    'jobs.update',
    'jobs.view',
    'matches.analyze',
    'matches.view',
    'preferences.update',
    'preferences.view',
    'profile.update',
    'profile.view',
    'resumes.create',
    'resumes.delete',
    'resumes.update',
    'resumes.view',
    'savedJobs.manage',
    'savedJobs.view',
    'skills.view',
    'ai.chat',
    'ai.resumeReview',
    'ai.status',
  ]),
});

function normalizeRole(role) {
  return typeof role === 'string' ? role.trim().toLowerCase() : '';
}

function requirePermission(...permissions) {
  const requiredPermissions = permissions.filter(
    (permission) => typeof permission === 'string' && permission.trim(),
  );

  return (req, res, next) => {
    const role = normalizeRole(req.user?.role);
    if (!role) {
      return res.status(401).json(errorResponse('Authentication required.', 401));
    }

    const grants = Object.hasOwn(rolePermissions, role) ? rolePermissions[role] : null;
    if (!grants || requiredPermissions.length !== permissions.length || !requiredPermissions.length) {
      return res.status(403).json(errorResponse('Access denied.', 403));
    }

    if (!requiredPermissions.every((permission) => grants.includes(permission))) {
      return res.status(403).json(errorResponse('Access denied.', 403));
    }

    return next();
  };
}

function authorize(...allowedRoles) {
  const requiredRoles = allowedRoles
    .flatMap((role) => (typeof role === 'string' ? role.split(',') : []))
    .map(normalizeRole)
    .filter(Boolean);

  return (req, res, next) => {
    const currentRole = normalizeRole(req.user?.role);

    if (!currentRole) {
      return res.status(401).json(errorResponse('Authentication required.', 401));
    }

    if (!requiredRoles.length) {
      return res.status(403).json(errorResponse('Access denied.', 403));
    }

    if (!requiredRoles.includes(currentRole)) {
      return res.status(403).json(
        errorResponse(`Access denied. Required role: ${requiredRoles.join(' or ')}.`, 403),
      );
    }

    return next();
  };
}

module.exports = { authorize, requirePermission, rolePermissions };
