const express = require('express');
const { getDailyTasks, claimDailyTask } = require('../utils/taskEngine');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: 'Oturum gerekli.' });
  next();
}

router.use(requireAuth);

router.get('/daily-tasks', async (req, res, next) => {
  try {
    res.json(await getDailyTasks(req.session.userId));
  } catch (error) {
    next(error);
  }
});

router.post('/daily-tasks/claim', async (req, res, next) => {
  try {
    res.json(await claimDailyTask(req.session.userId, req.body.taskKey));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
