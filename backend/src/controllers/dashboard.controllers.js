const Dashboard = require('../models/dashboard/dashboard');
const { asyncHandler } = require('../utils/asyncHandler');
const { AppError } = require('../utils/AppError');

exports.getStaffResumen = asyncHandler(async (_req, res) => {
  const data = await Dashboard.getStaffResumen();
  res.json({ success: true, data });
});

exports.getAvailableModules = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    throw AppError.unauthorized();
  }
  const data = await Dashboard.getAvailableModulesForUser(userId);
  if (!data) {
    throw AppError.notFound('Usuario no encontrado');
  }
  res.json({ success: true, data });
});
