const express = require('express');
const {
  listInboxMessages,
  unreadCount,
  markMessageRead,
  markAllMessagesRead,
  handleMessageAction
} = require('../utils/inboxEngine');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: 'Oturum gerekli.' });
  next();
}

router.use(requireAuth);

router.get('/messages', async (req, res, next) => {
  try {
    res.json(await listInboxMessages(req.session.userId, {
      category: req.query.category || 'all',
      unreadOnly: req.query.unreadOnly === '1',
      limit: req.query.limit || 50
    }));
  } catch (error) {
    next(error);
  }
});

router.get('/messages/unread-count', async (req, res, next) => {
  try {
    res.json({ count: await unreadCount(req.session.userId) });
  } catch (error) {
    next(error);
  }
});

router.patch('/messages/:id/read', async (req, res, next) => {
  try {
    const message = await markMessageRead(req.session.userId, Number(req.params.id));
    if (!message) return res.status(404).json({ message: 'Mesaj bulunamadı.' });
    res.json(message);
  } catch (error) {
    next(error);
  }
});

router.patch('/messages/read-all', async (req, res, next) => {
  try {
    res.json(await markAllMessagesRead(req.session.userId));
  } catch (error) {
    next(error);
  }
});

router.post('/messages/:id/action', async (req, res, next) => {
  try {
    res.json(await handleMessageAction(req.session.userId, Number(req.params.id), req.body.action || 'read'));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
