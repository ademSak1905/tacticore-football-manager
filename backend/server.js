const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const { initDatabase } = require('./database');

function loadLocalEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadLocalEnv();

const authRoutes = require('./routes/auth');
const clubRoutes = require('./routes/club');
const playerRoutes = require('./routes/players');
const tacticRoutes = require('./routes/tactics');
const matchRoutes = require('./routes/matches');
const leagueRoutes = require('./routes/league');
const transferRoutes = require('./routes/transfers');
const trainingRoutes = require('./routes/training');
const teamRoutes = require('./routes/teams');
const gameRoutes = require('./routes/game');
const europeRoutes = require('./routes/europe');
const managerRoutes = require('./routes/manager');
const messageRoutes = require('./routes/messages');
const { FORMATIONS } = require('./utils/tacticEngine');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
const frontendPath = path.join(__dirname, '..', 'frontend');

app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: __dirname }),
    secret: process.env.SESSION_SECRET || 'dev-football-manager-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: isProduction ? 'none' : 'lax',
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

app.use(express.static(frontendPath));

app.use('/api', authRoutes);
app.use('/api', managerRoutes);
app.use('/api', teamRoutes);
app.use('/api', gameRoutes);
app.use('/api', europeRoutes);
app.use('/api', messageRoutes);
app.get('/api/formations', (req, res) => {
  res.json(Object.entries(FORMATIONS).map(([id, item]) => ({ id, ...item })));
});
app.use('/api/club', clubRoutes);
app.use('/api', playerRoutes);
app.use('/api/tactics', tacticRoutes);
app.use('/api', matchRoutes);
app.use('/api/league', leagueRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/training', trainingRoutes);

app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: err.message || 'Sunucu hatasi' });
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Football manager oyunu http://localhost:${PORT} adresinde calisiyor.`);
    });
  })
  .catch((error) => {
    console.error('Veritabani baslatilamadi:', error);
    process.exit(1);
  });
