const path = require('path');
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const { initDatabase } = require('./database');

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
const { FORMATIONS } = require('./utils/tacticEngine');

const app = express();
const PORT = process.env.PORT || 3000;

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
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.use('/api', authRoutes);
app.use('/api', teamRoutes);
app.use('/api', gameRoutes);
app.use('/api', europeRoutes);
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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
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
