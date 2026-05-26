const express = require('express');
const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const clubModel = require('../models/clubModel');
const {
  run,
  get,
  all,
  resetCareerProgress,
  ensureInitialCareerSave,
  listCareerSaves,
  createCareerSave,
  restoreCareerSave,
  seedGalatasaraySon16Demo
} = require('../database');

const router = express.Router();

function cleanText(value) {
  return String(value || '').trim();
}

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: 'Oturum gerekli.' });
  next();
}

function careerClubName(teamName, userId) {
  return `${teamName} Kariyer ${userId}`;
}

router.post('/register', async (req, res, next) => {
  try {
    const username = cleanText(req.body.username);
    const email = cleanText(req.body.email).toLowerCase();
    const password = String(req.body.password || '').trim();
    const teamId = Number(req.body.teamId);
    if (!Number.isInteger(teamId) || teamId < 1) {
      return res.status(400).json({ message: 'Lütfen kariyer için bir takım seçin.' });
    }

    const selectedTeam = await get('SELECT * FROM teams WHERE id = ?', [teamId]);
    if (!selectedTeam) {
      return res.status(400).json({ message: 'Seçilen takım bulunamadı. Sayfayı yenileyip tekrar deneyin.' });
    }

    const clubName = cleanText(req.body.clubName || selectedTeam?.name || `${username} FC`);

    if (username.length < 3 || !email.includes('@') || password.length < 6 || clubName.length < 3) {
      return res.status(400).json({ message: 'Kullanıcı, e-posta, şifre ve takım adı bilgilerini kontrol edin.' });
    }

    const existing = await userModel.findByUsernameOrEmail(username, email);
    if (existing) return res.status(409).json({ message: 'Bu kullanıcı adı veya e-posta zaten kayıtlı.' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await userModel.createUser(username, email, passwordHash);
    const club = await clubModel.createClub(user.id, careerClubName(clubName, user.id), selectedTeam.id);
    await resetCareerProgress(user.id);
    await run('INSERT INTO tactics (club_id, formation, mentality, pressing, passing_style, tempo) VALUES (?, ?, ?, ?, ?, ?)', [
      club.id,
      selectedTeam?.default_formation || '4-2-3-1',
      'balanced',
      55,
      'mixed',
      55
    ]);
    await ensureInitialCareerSave(user.id);

    req.session.userId = user.id;
    res.status(201).json({ id: user.id, username, email, clubName: selectedTeam.name, teamId: selectedTeam.id });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ message: 'Bu takım adı veya hesap bilgileri kullanılıyor.' });
    next(error);
  }
});

router.post('/career/new', requireAuth, async (req, res, next) => {
  try {
    const teamId = Number(req.body.teamId);
    if (!Number.isInteger(teamId) || teamId < 1) {
      return res.status(400).json({ message: 'Lütfen kariyer için bir takım seçin.' });
    }

    const selectedTeam = await get('SELECT * FROM teams WHERE id = ?', [teamId]);
    if (!selectedTeam) {
      return res.status(400).json({ message: 'Seçilen takım bulunamadı. Sayfayı yenileyip tekrar deneyin.' });
    }

    const clubName = cleanText(req.body.clubName || selectedTeam.name);
    const career = await createCareerSave(req.session.userId, selectedTeam.id, clubName);
    const club = await clubModel.getByUserId(req.session.userId);
    await run('DELETE FROM tactics WHERE club_id = ?', [club.id]);
    await run('INSERT INTO tactics (club_id, formation, mentality, pressing, passing_style, tempo) VALUES (?, ?, ?, ?, ?, ?)', [
      club.id,
      selectedTeam.default_formation || '4-2-3-1',
      'balanced',
      55,
      'mixed',
      55
    ]);

    res.json({ message: 'Yeni kariyer hazır.', career, teamId: selectedTeam.id, clubName: selectedTeam.name });
  } catch (error) {
    if (String(error.message).includes('En fazla 5')) return res.status(400).json({ message: error.message });
    next(error);
  }
});

router.get('/careers', requireAuth, async (req, res, next) => {
  try {
    res.json(await listCareerSaves(req.session.userId));
  } catch (error) {
    next(error);
  }
});

router.post('/career/load/:id', requireAuth, async (req, res, next) => {
  try {
    const career = await restoreCareerSave(req.session.userId, Number(req.params.id));
    res.json({ message: 'Kariyer yüklendi.', career });
  } catch (error) {
    if (String(error.message).includes('bulunamadı')) return res.status(404).json({ message: error.message });
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const login = cleanText(req.body.login || req.body.username || req.body.email);
    const password = String(req.body.password || '').trim();
    if (login === 'gs_son16' && password === 'galatasaray16') {
      await seedGalatasaraySon16Demo();
    }
    const user = await userModel.findByLogin(login);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: 'Giriş bilgileri hatalı.' });
    }

    req.session.userId = user.id;
    res.json({ id: user.id, username: user.username, email: user.email });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ message: 'Çıkış yapıldı.' });
  });
});

router.get('/me', async (req, res, next) => {
  try {
    if (!req.session.userId) return res.status(401).json({ message: 'Oturum bulunamadı.' });
    const club = await clubModel.getByUserId(req.session.userId);
    res.json({ userId: req.session.userId, club });
  } catch (error) {
    next(error);
  }
});

router.get('/register/options', async (req, res, next) => {
  try {
    const teams = await all('SELECT id, name, logo_url, city, stadium, overall FROM teams ORDER BY name');
    res.json(teams);
  } catch (error) {
    next(error);
  }
});

module.exports = router;


