const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const { createPlayerBatch, createMarketPlayers } = require('./utils/generatePlayers');
const { seedSuperLigData } = require('./seed/superligSeed');
const { seedEuropeanData } = require('./seed/uefaSeed');
const { seasonDate, leagueMatchDay } = require('./utils/seasonCalendar');
const { buildSeasonPlan, parseSeasonPlan } = require('./utils/seasonPlanning');

const dbPath = path.join(__dirname, 'football_manager.sqlite');
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function createSchema() {
  await run('PRAGMA foreign_keys = ON');

  await run(`
    CREATE TABLE IF NOT EXISTS game_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      current_day INTEGER NOT NULL DEFAULT 1,
      next_match_day INTEGER NOT NULL DEFAULT 7,
      week INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS career_states (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      current_day INTEGER NOT NULL DEFAULT 1,
      next_match_day INTEGER NOT NULL DEFAULT 7,
      week INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS career_saves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      slot_number INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      current_day INTEGER NOT NULL DEFAULT 1,
      next_match_day INTEGER NOT NULL DEFAULT 7,
      week INTEGER NOT NULL DEFAULT 1,
      standings_json TEXT NOT NULL DEFAULT '[]',
      matches_json TEXT NOT NULL DEFAULT '{"matches":[],"events":[],"ratings":[]}',
      europe_json TEXT NOT NULL DEFAULT '{"entries":[],"matches":[],"standings":[],"draws":[],"history":[],"awards":[],"snapshots":[]}',
      club_budget INTEGER NOT NULL DEFAULT 0,
      salary_budget INTEGER NOT NULL DEFAULT 0,
      season_json TEXT NOT NULL DEFAULT '{}',
      season_intro_seen INTEGER NOT NULL DEFAULT 0,
      season_summary_seen INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, slot_number),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (team_id) REFERENCES teams(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS league_standings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      goals_for INTEGER NOT NULL DEFAULT 0,
      goals_against INTEGER NOT NULL DEFAULT 0,
      form TEXT NOT NULL DEFAULT '',
      UNIQUE(user_id, team_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS social_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day INTEGER NOT NULL,
      type TEXT NOT NULL,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      template_key TEXT,
      category TEXT NOT NULL DEFAULT 'social',
      team_id INTEGER,
      player_id INTEGER,
      match_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS news_feed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day INTEGER NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      template_key TEXT,
      team_id INTEGER,
      player_id INTEGER,
      match_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS used_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_key TEXT NOT NULL,
      feed_type TEXT NOT NULL,
      week INTEGER NOT NULL DEFAULT 0,
      day INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS transfer_interest (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL,
      from_team_id INTEGER,
      interested_team_id INTEGER,
      category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'rumor',
      offer_price INTEGER NOT NULL DEFAULT 0,
      wage_offer INTEGER NOT NULL DEFAULT 0,
      signing_bonus INTEGER NOT NULL DEFAULT 0,
      loan_fee INTEGER NOT NULL DEFAULT 0,
      buy_option INTEGER NOT NULL DEFAULT 0,
      sell_on_percent INTEGER NOT NULL DEFAULT 0,
      first_team_promise INTEGER NOT NULL DEFAULT 0,
      decision_score INTEGER NOT NULL DEFAULT 0,
      day INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (player_id) REFERENCES players(id),
      FOREIGN KEY (from_team_id) REFERENCES teams(id),
      FOREIGN KEY (interested_team_id) REFERENCES teams(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS transfer_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL,
      from_team_id INTEGER,
      to_team_id INTEGER,
      category TEXT NOT NULL,
      price INTEGER NOT NULL DEFAULT 0,
      wage INTEGER NOT NULL DEFAULT 0,
      signing_bonus INTEGER NOT NULL DEFAULT 0,
      loan_fee INTEGER NOT NULL DEFAULT 0,
      buy_option INTEGER NOT NULL DEFAULT 0,
      sell_on_percent INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'completed',
      day INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (player_id) REFERENCES players(id),
      FOREIGN KEY (from_team_id) REFERENCES teams(id),
      FOREIGN KEY (to_team_id) REFERENCES teams(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS manager_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      manager_name TEXT NOT NULL,
      total_xp INTEGER NOT NULL DEFAULT 0,
      last_xp_gain INTEGER NOT NULL DEFAULT 0,
      seasons INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS manager_xp_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      event_key TEXT NOT NULL,
      amount INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, event_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS manager_achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      achievement_key TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, achievement_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      short_name TEXT NOT NULL,
      logo_url TEXT,
      city TEXT,
      stadium TEXT,
      budget INTEGER NOT NULL DEFAULT 0,
      fans INTEGER NOT NULL DEFAULT 0,
      overall INTEGER NOT NULL DEFAULT 60,
      attack_overall INTEGER NOT NULL DEFAULT 60,
      midfield_overall INTEGER NOT NULL DEFAULT 60,
      defense_overall INTEGER NOT NULL DEFAULT 60,
      goalkeeper_overall INTEGER NOT NULL DEFAULT 60,
      default_formation TEXT NOT NULL DEFAULT '4-2-3-1',
      points INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      goals_for INTEGER NOT NULL DEFAULT 0,
      goals_against INTEGER NOT NULL DEFAULT 0,
      form TEXT NOT NULL DEFAULT ''
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS clubs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE,
      team_id INTEGER,
      currency TEXT NOT NULL DEFAULT 'EUR',
      name TEXT NOT NULL UNIQUE,
      budget INTEGER NOT NULL DEFAULT 5000000,
      salary_budget INTEGER NOT NULL DEFAULT 0,
      season_objectives_json TEXT NOT NULL DEFAULT '{}',
      season_intro_seen INTEGER NOT NULL DEFAULT 0,
      season_summary_seen INTEGER NOT NULL DEFAULT 0,
      stadium_capacity INTEGER NOT NULL DEFAULT 18000,
      fans INTEGER NOT NULL DEFAULT 15000,
      points INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      goals_for INTEGER NOT NULL DEFAULT 0,
      goals_against INTEGER NOT NULL DEFAULT 0,
      last_match TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (team_id) REFERENCES teams(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id INTEGER,
      team_id INTEGER,
      name TEXT NOT NULL,
      age INTEGER NOT NULL DEFAULT 24,
      nationality TEXT NOT NULL DEFAULT 'Türkiye',
      position TEXT NOT NULL CHECK(position IN ('GK', 'DEF', 'MID', 'FWD')),
      preferred_foot TEXT NOT NULL DEFAULT 'right',
      overall INTEGER NOT NULL,
      pace INTEGER NOT NULL,
      shooting INTEGER NOT NULL,
      passing INTEGER NOT NULL,
      dribbling INTEGER NOT NULL DEFAULT 60,
      defending INTEGER NOT NULL,
      physical INTEGER NOT NULL DEFAULT 60,
      stamina INTEGER NOT NULL,
      morale INTEGER NOT NULL,
      salary INTEGER NOT NULL,
      market_value INTEGER NOT NULL,
      potential INTEGER NOT NULL DEFAULT 70,
      contract_until INTEGER NOT NULL DEFAULT 2027,
      happiness INTEGER NOT NULL DEFAULT 70,
      playing_time INTEGER NOT NULL DEFAULT 50,
      transfer_status TEXT NOT NULL DEFAULT 'normal',
      loan_available INTEGER NOT NULL DEFAULT 0,
      injured INTEGER NOT NULL DEFAULT 0,
      image_url TEXT,
      is_starting_eleven INTEGER NOT NULL DEFAULT 0,
      lineup_role TEXT NOT NULL DEFAULT 'reserve',
      FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE SET NULL,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS lineups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      formation TEXT NOT NULL,
      player_id INTEGER NOT NULL,
      position_slot TEXT NOT NULL,
      x_position INTEGER NOT NULL,
      y_position INTEGER NOT NULL,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS tactics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id INTEGER NOT NULL UNIQUE,
      formation TEXT NOT NULL DEFAULT '4-4-2',
      mentality TEXT NOT NULL DEFAULT 'balanced',
      attack_style TEXT NOT NULL DEFAULT 'balanced',
      defense_style TEXT NOT NULL DEFAULT 'zonal',
      pressing INTEGER NOT NULL DEFAULT 55,
      passing_style TEXT NOT NULL DEFAULT 'mixed',
      tempo INTEGER NOT NULL DEFAULT 55,
      tempo_label TEXT NOT NULL DEFAULT 'normal',
      defensive_line INTEGER NOT NULL DEFAULT 50,
      aggression INTEGER NOT NULL DEFAULT 50,
      width INTEGER NOT NULL DEFAULT 60,
      FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      home_club_id INTEGER NOT NULL,
      away_club_id INTEGER NOT NULL,
      home_score INTEGER NOT NULL DEFAULT 0,
      away_score INTEGER NOT NULL DEFAULT 0,
      match_day INTEGER,
      match_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      played INTEGER NOT NULL DEFAULT 0,
      possession_home INTEGER NOT NULL DEFAULT 50,
      shots_home INTEGER NOT NULL DEFAULT 0,
      shots_away INTEGER NOT NULL DEFAULT 0,
      shots_on_home INTEGER NOT NULL DEFAULT 0,
      shots_on_away INTEGER NOT NULL DEFAULT 0,
      pass_home INTEGER NOT NULL DEFAULT 75,
      pass_away INTEGER NOT NULL DEFAULT 75,
      fouls_home INTEGER NOT NULL DEFAULT 0,
      fouls_away INTEGER NOT NULL DEFAULT 0,
      corners_home INTEGER NOT NULL DEFAULT 0,
      corners_away INTEGER NOT NULL DEFAULT 0,
      offsides_home INTEGER NOT NULL DEFAULT 0,
      offsides_away INTEGER NOT NULL DEFAULT 0,
      xg_home REAL NOT NULL DEFAULT 0,
      xg_away REAL NOT NULL DEFAULT 0,
      saves_home INTEGER NOT NULL DEFAULT 0,
      saves_away INTEGER NOT NULL DEFAULT 0,
      tackles_home INTEGER NOT NULL DEFAULT 0,
      tackles_away INTEGER NOT NULL DEFAULT 0,
      successful_press_home INTEGER NOT NULL DEFAULT 0,
      successful_press_away INTEGER NOT NULL DEFAULT 0,
      tactic_score_home INTEGER NOT NULL DEFAULT 50,
      tactic_score_away INTEGER NOT NULL DEFAULT 50,
      tactical_summary TEXT,
      man_of_match TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS match_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL,
      minute INTEGER NOT NULL,
      event_text TEXT NOT NULL,
      event_type TEXT NOT NULL DEFAULT 'commentary',
      is_highlight INTEGER NOT NULL DEFAULT 0,
      team_id INTEGER,
      scorer_id INTEGER,
      assist_id INTEGER,
      home_score INTEGER NOT NULL DEFAULT 0,
      away_score INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS match_player_ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      rating REAL NOT NULL,
      goals INTEGER NOT NULL DEFAULT 0,
      assists INTEGER NOT NULL DEFAULT 0,
      yellow_cards INTEGER NOT NULL DEFAULT 0,
      red_cards INTEGER NOT NULL DEFAULT 0,
      injured INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
      FOREIGN KEY (player_id) REFERENCES players(id),
      FOREIGN KEY (team_id) REFERENCES teams(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL,
      from_club_id INTEGER,
      to_club_id INTEGER,
      price INTEGER NOT NULL,
      transfer_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (player_id) REFERENCES players(id),
      FOREIGN KEY (from_club_id) REFERENCES clubs(id),
      FOREIGN KEY (to_club_id) REFERENCES clubs(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS training (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id INTEGER NOT NULL,
      player_id INTEGER,
      type TEXT NOT NULL,
      intensity TEXT NOT NULL DEFAULT 'normal',
      game_day INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS training_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id INTEGER NOT NULL,
      player_id INTEGER,
      result_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE SET NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS european_competitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      theme TEXT NOT NULL DEFAULT 'champions',
      logo_url TEXT,
      league_matches INTEGER NOT NULL DEFAULT 6,
      direct_qualify_count INTEGER NOT NULL DEFAULT 8,
      playoff_start INTEGER NOT NULL DEFAULT 9,
      playoff_end INTEGER NOT NULL DEFAULT 24,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS european_teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      short_name TEXT NOT NULL,
      logo_url TEXT,
      country TEXT NOT NULL,
      league TEXT NOT NULL,
      overall INTEGER NOT NULL DEFAULT 75,
      attack_overall INTEGER NOT NULL DEFAULT 75,
      midfield_overall INTEGER NOT NULL DEFAULT 75,
      defense_overall INTEGER NOT NULL DEFAULT 75,
      goalkeeper_overall INTEGER NOT NULL DEFAULT 75,
      power_level TEXT NOT NULL DEFAULT 'strong',
      pot INTEGER NOT NULL DEFAULT 3
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS european_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      season INTEGER NOT NULL DEFAULT 2025,
      competition_code TEXT NOT NULL,
      team_id INTEGER,
      european_team_id INTEGER,
      source TEXT NOT NULL DEFAULT 'league',
      entry_stage TEXT NOT NULL DEFAULT 'league',
      status TEXT NOT NULL DEFAULT 'active',
      UNIQUE(season, competition_code, team_id, european_team_id),
      FOREIGN KEY (team_id) REFERENCES teams(id),
      FOREIGN KEY (european_team_id) REFERENCES european_teams(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS european_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      season INTEGER NOT NULL DEFAULT 2025,
      competition_code TEXT NOT NULL,
      phase TEXT NOT NULL,
      round_name TEXT NOT NULL,
      leg INTEGER NOT NULL DEFAULT 1,
      match_day INTEGER NOT NULL,
      match_date TEXT NOT NULL,
      home_team_id INTEGER,
      away_team_id INTEGER,
      home_european_team_id INTEGER,
      away_european_team_id INTEGER,
      home_score INTEGER NOT NULL DEFAULT 0,
      away_score INTEGER NOT NULL DEFAULT 0,
      aggregate_home INTEGER,
      aggregate_away INTEGER,
      penalties_home INTEGER,
      penalties_away INTEGER,
      played INTEGER NOT NULL DEFAULT 0,
      possession_home INTEGER NOT NULL DEFAULT 50,
      shots_home INTEGER NOT NULL DEFAULT 0,
      shots_away INTEGER NOT NULL DEFAULT 0,
      shots_on_home INTEGER NOT NULL DEFAULT 0,
      shots_on_away INTEGER NOT NULL DEFAULT 0,
      xg_home REAL NOT NULL DEFAULT 0,
      xg_away REAL NOT NULL DEFAULT 0,
      event_log TEXT,
      tactical_summary TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS european_standings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      season INTEGER NOT NULL DEFAULT 2025,
      competition_code TEXT NOT NULL,
      team_id INTEGER,
      european_team_id INTEGER,
      played INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      goals_for INTEGER NOT NULL DEFAULT 0,
      goals_against INTEGER NOT NULL DEFAULT 0,
      points INTEGER NOT NULL DEFAULT 0,
      UNIQUE(season, competition_code, team_id, european_team_id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS european_draws (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      season INTEGER NOT NULL DEFAULT 2025,
      competition_code TEXT NOT NULL,
      phase TEXT NOT NULL,
      draw_data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS european_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      season INTEGER NOT NULL DEFAULT 2025,
      competition_code TEXT NOT NULL,
      team_id INTEGER,
      european_team_id INTEGER,
      event_type TEXT NOT NULL,
      description TEXT NOT NULL,
      money_award INTEGER NOT NULL DEFAULT 0,
      prestige_delta INTEGER NOT NULL DEFAULT 0,
      fan_delta INTEGER NOT NULL DEFAULT 0,
      day INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS european_awards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      season INTEGER NOT NULL DEFAULT 2025,
      competition_code TEXT NOT NULL,
      team_id INTEGER,
      award_type TEXT NOT NULL,
      amount INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS squad_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      club_id INTEGER,
      team_id INTEGER,
      week INTEGER NOT NULL DEFAULT 1,
      day INTEGER NOT NULL DEFAULT 1,
      snapshot_data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn('clubs', 'team_id', 'INTEGER');
  await ensureColumn('clubs', 'currency', "TEXT NOT NULL DEFAULT 'EUR'");
  await ensureColumn('players', 'team_id', 'INTEGER');
  await ensureColumn('players', 'nationality', "TEXT NOT NULL DEFAULT 'Türkiye'");
  await ensureColumn('players', 'preferred_foot', "TEXT NOT NULL DEFAULT 'right'");
  await ensureColumn('players', 'dribbling', 'INTEGER NOT NULL DEFAULT 60');
  await ensureColumn('players', 'physical', 'INTEGER NOT NULL DEFAULT 60');
  await ensureColumn('players', 'image_url', 'TEXT');
  await ensureColumn('players', 'is_starting_eleven', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('players', 'role', 'TEXT');
  await ensureColumn('players', 'potential', 'INTEGER NOT NULL DEFAULT 70');
  await ensureColumn('players', 'contract_until', 'INTEGER NOT NULL DEFAULT 2027');
  await ensureColumn('players', 'happiness', 'INTEGER NOT NULL DEFAULT 70');
  await ensureColumn('players', 'playing_time', 'INTEGER NOT NULL DEFAULT 50');
  await ensureColumn('players', 'transfer_status', "TEXT NOT NULL DEFAULT 'normal'");
  await ensureColumn('players', 'loan_available', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('social_posts', 'template_key', 'TEXT');
  await ensureColumn('social_posts', 'category', "TEXT NOT NULL DEFAULT 'social'");
  await ensureColumn('social_posts', 'team_id', 'INTEGER');
  await ensureColumn('social_posts', 'player_id', 'INTEGER');
  await ensureColumn('social_posts', 'match_id', 'INTEGER');
  await ensureColumn('tactics', 'attack_style', "TEXT NOT NULL DEFAULT 'balanced'");
  await ensureColumn('tactics', 'defense_style', "TEXT NOT NULL DEFAULT 'zonal'");
  await ensureColumn('tactics', 'tempo_label', "TEXT NOT NULL DEFAULT 'normal'");
  await ensureColumn('tactics', 'defensive_line', 'INTEGER NOT NULL DEFAULT 50');
  await ensureColumn('tactics', 'aggression', 'INTEGER NOT NULL DEFAULT 50');
  await ensureColumn('tactics', 'width', 'INTEGER NOT NULL DEFAULT 60');
  await ensureColumn('training', 'player_id', 'INTEGER');
  await ensureColumn('training', 'intensity', "TEXT NOT NULL DEFAULT 'normal'");
  await ensureColumn('training', 'game_day', 'INTEGER');
  await ensureColumn('match_events', 'event_type', "TEXT NOT NULL DEFAULT 'commentary'");
  await ensureColumn('match_events', 'is_highlight', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('match_events', 'team_id', 'INTEGER');
  await ensureColumn('match_events', 'scorer_id', 'INTEGER');
  await ensureColumn('match_events', 'assist_id', 'INTEGER');
  await ensureColumn('match_events', 'home_score', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('match_events', 'away_score', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('matches', 'match_day', 'INTEGER');
  await ensureColumn('matches', 'user_id', 'INTEGER');
  await ensureColumn('matches', 'offsides_home', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('matches', 'offsides_away', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('matches', 'xg_home', 'REAL NOT NULL DEFAULT 0');
  await ensureColumn('matches', 'xg_away', 'REAL NOT NULL DEFAULT 0');
  await ensureColumn('matches', 'saves_home', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('matches', 'saves_away', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('matches', 'tackles_home', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('matches', 'tackles_away', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('matches', 'successful_press_home', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('matches', 'successful_press_away', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('matches', 'tactic_score_home', 'INTEGER NOT NULL DEFAULT 50');
  await ensureColumn('matches', 'tactic_score_away', 'INTEGER NOT NULL DEFAULT 50');
  await ensureColumn('matches', 'tactical_summary', 'TEXT');
  await ensureColumn('matches', 'man_of_match', 'TEXT');
  await ensureColumn('teams', 'prestige', 'INTEGER NOT NULL DEFAULT 50');
  await ensureColumn('career_saves', 'europe_json', 'TEXT NOT NULL DEFAULT \'{"entries":[],"matches":[],"standings":[],"draws":[],"history":[],"awards":[],"snapshots":[]}\'');
  await ensureColumn('career_saves', 'club_budget', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('career_saves', 'salary_budget', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('career_saves', 'season_json', "TEXT NOT NULL DEFAULT '{}'");
  await ensureColumn('career_saves', 'season_intro_seen', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('career_saves', 'season_summary_seen', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('clubs', 'salary_budget', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('clubs', 'season_objectives_json', "TEXT NOT NULL DEFAULT '{}'");
  await ensureColumn('clubs', 'season_intro_seen', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('clubs', 'season_summary_seen', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('european_entries', 'user_id', 'INTEGER');
  await ensureColumn('european_matches', 'user_id', 'INTEGER');
  await ensureColumn('european_standings', 'user_id', 'INTEGER');
  await ensureColumn('european_draws', 'user_id', 'INTEGER');
  await ensureColumn('european_history', 'user_id', 'INTEGER');
  await ensureColumn('european_awards', 'user_id', 'INTEGER');
  await ensureColumn('squad_snapshots', 'user_id', 'INTEGER');
}

async function ensureColumn(table, column, definition) {
  const columns = await all(`PRAGMA table_info(${table})`);
  if (!columns.some((item) => item.name === column)) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function insertPlayersForClub(clubId, strength = 60) {
  const players = createPlayerBatch(strength);
  for (const player of players) {
    await run(
      `INSERT INTO players
        (club_id, name, age, position, overall, pace, shooting, passing, defending, stamina, morale, salary, market_value, injured, lineup_role)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clubId,
        player.name,
        player.age,
        player.position,
        player.overall,
        player.pace,
        player.shooting,
        player.passing,
        player.defending,
        player.stamina,
        player.morale,
        player.salary,
        player.market_value,
        player.injured ? 1 : 0,
        player.lineup_role
      ]
    );
  }
}

async function seedBotClubs() {
  const existingBots = await get('SELECT COUNT(*) AS count FROM clubs WHERE user_id IS NULL');
  if (existingBots.count >= 9) return;

  const botNames = [
    'Istanbul Kartallari',
    'Ankara Zirve',
    'Izmir Firtina',
    'Bursa Yesilspor',
    'Antalya Gunes',
    'Trabzon Deniz',
    'Adana Akincilar',
    'Konya Hilal',
    'Kayseri Yildiz'
  ];

  for (let index = existingBots.count; index < botNames.length; index += 1) {
    const name = botNames[index];
    const club = await run(
      `INSERT OR IGNORE INTO clubs
        (user_id, name, budget, stadium_capacity, fans)
       VALUES (NULL, ?, ?, ?, ?)`,
      [name, 3500000 + index * 300000, 14000 + index * 1200, 11000 + index * 900]
    );

    const storedClub = club.id ? { id: club.id } : await get('SELECT id FROM clubs WHERE name = ?', [name]);
    await run('INSERT OR IGNORE INTO tactics (club_id, formation, mentality, pressing, passing_style, tempo) VALUES (?, ?, ?, ?, ?, ?)', [
      storedClub.id,
      index % 2 === 0 ? '4-4-2' : '4-3-3',
      'balanced',
      48 + index,
      'mixed',
      52 + index
    ]);
    await insertPlayersForClub(storedClub.id, 55 + index);
  }
}

async function seedTransferMarket() {
  const existingMarket = await get('SELECT COUNT(*) AS count FROM players WHERE club_id IS NULL AND team_id IS NULL');
  if (existingMarket.count >= 16) return;

  const players = createMarketPlayers(20 - existingMarket.count);
  for (const player of players) {
    await run(
      `INSERT INTO players
        (club_id, name, age, position, overall, pace, shooting, passing, defending, stamina, morale, salary, market_value, injured)
       VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        player.name,
        player.age,
        player.position,
        player.overall,
        player.pace,
        player.shooting,
        player.passing,
        player.defending,
        player.stamina,
        player.morale,
        player.salary,
        player.market_value,
        player.injured ? 1 : 0
      ]
    );
  }
}

async function backfillMatchDays() {
  const teams = await get('SELECT COUNT(*) AS count FROM teams');
  const matchesPerRound = Math.max(1, Math.floor(Number(teams?.count || 18) / 2));
  const rows = await all('SELECT id FROM matches WHERE match_day IS NULL ORDER BY id ASC');

  for (let index = 0; index < rows.length; index += 1) {
    const matchDay = 7 + Math.floor(index / matchesPerRound) * 7;
    await run('UPDATE matches SET match_day = ?, match_date = ? WHERE id = ?', [
      matchDay,
      seasonDate(matchDay),
      rows[index].id
    ]);
  }
}

async function backfillSeasonPlans() {
  const clubs = await all(`
    SELECT c.*, t.overall, t.attack_overall, t.midfield_overall, t.defense_overall, t.goalkeeper_overall
    FROM clubs c
    LEFT JOIN teams t ON t.id = c.team_id
  `);
  for (const club of clubs) {
    const oldPlanText = club.season_objectives_json || '{}';
    const plan = parseSeasonPlan(club.season_objectives_json, club);
    const planWasOld = !String(oldPlanText).includes('"financeVersion":2');
    const budget = planWasOld ? plan.transferBudget : (club.budget || plan.transferBudget);
    const salaryBudget = planWasOld ? plan.salaryBudget : (club.salary_budget || plan.salaryBudget);
    await run(`
      UPDATE clubs
      SET currency = 'EUR', budget = ?, salary_budget = ?, season_objectives_json = ?
      WHERE id = ?
    `, [budget, salaryBudget, JSON.stringify(plan), club.id]);
  }

  const saves = await all(`
    SELECT cs.*, t.overall, t.attack_overall, t.midfield_overall, t.defense_overall, t.goalkeeper_overall
    FROM career_saves cs
    LEFT JOIN teams t ON t.id = cs.team_id
  `);
  for (const save of saves) {
    const oldPlanText = save.season_json || '{}';
    const plan = parseSeasonPlan(save.season_json, save);
    const planWasOld = !String(oldPlanText).includes('"financeVersion":2');
    await run(`
      UPDATE career_saves
      SET club_budget = ?, salary_budget = ?, season_json = ?
      WHERE id = ?
    `, [
      planWasOld ? plan.transferBudget : (save.club_budget || plan.transferBudget),
      planWasOld ? plan.salaryBudget : (save.salary_budget || plan.salaryBudget),
      JSON.stringify(plan),
      save.id
    ]);
  }
}

async function ensureCareerForUser(userId) {
  await run('INSERT OR IGNORE INTO career_states (user_id, current_day, next_match_day, week) VALUES (?, 1, 7, 1)', [userId]);
  const teams = await all('SELECT id FROM teams ORDER BY id ASC');
  for (const team of teams) {
    await run('INSERT OR IGNORE INTO league_standings (user_id, team_id) VALUES (?, ?)', [userId, team.id]);
  }
  return get('SELECT * FROM career_states WHERE user_id = ?', [userId]);
}

async function collectCareerSnapshot(userId) {
  const state = await getCareerState(userId);
  const standings = await all('SELECT team_id, points, wins, draws, losses, goals_for, goals_against, form FROM league_standings WHERE user_id = ? ORDER BY team_id', [userId]);
  const matches = await all('SELECT * FROM matches WHERE user_id = ? ORDER BY id ASC', [userId]);
  const europeData = await collectEuropeSnapshot(userId);
  const matchIds = matches.map((match) => match.id);
  if (!matchIds.length) return { state, standings, matchData: { matches: [], events: [], ratings: [] }, europeData };

  const placeholders = matchIds.map(() => '?').join(',');
  const events = await all(`SELECT * FROM match_events WHERE match_id IN (${placeholders}) ORDER BY match_id, minute, id`, matchIds);
  const ratings = await all(`SELECT * FROM match_player_ratings WHERE match_id IN (${placeholders}) ORDER BY match_id, id`, matchIds);
  return { state, standings, matchData: { matches, events, ratings }, europeData };
}

async function collectEuropeSnapshot(userId) {
  return {
    entries: await all('SELECT * FROM european_entries WHERE user_id = ? ORDER BY id ASC', [userId]),
    matches: await all('SELECT * FROM european_matches WHERE user_id = ? ORDER BY id ASC', [userId]),
    standings: await all('SELECT * FROM european_standings WHERE user_id = ? ORDER BY id ASC', [userId]),
    draws: await all("SELECT * FROM european_draws WHERE user_id = ? AND competition_code != 'CONFIG' ORDER BY id ASC", [userId]),
    history: await all('SELECT * FROM european_history WHERE user_id = ? ORDER BY id ASC', [userId]),
    awards: await all('SELECT * FROM european_awards WHERE user_id = ? ORDER BY id ASC', [userId]),
    snapshots: await all('SELECT * FROM squad_snapshots WHERE user_id = ? ORDER BY id ASC', [userId])
  };
}

async function insertSnapshotRows(table, rows) {
  for (const row of rows || []) {
    const copy = { ...row };
    delete copy.id;
    const columns = Object.keys(copy);
    if (!columns.length) continue;
    const placeholders = columns.map(() => '?').join(', ');
    await run(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
      columns.map((column) => copy[column])
    );
  }
}

async function restoreEuropeSnapshot(userId, europeData) {
  await run('DELETE FROM european_awards WHERE user_id = ?', [userId]);
  await run('DELETE FROM european_history WHERE user_id = ?', [userId]);
  await run('DELETE FROM european_draws WHERE user_id = ?', [userId]);
  await run('DELETE FROM european_matches WHERE user_id = ?', [userId]);
  await run('DELETE FROM european_standings WHERE user_id = ?', [userId]);
  await run('DELETE FROM european_entries WHERE user_id = ?', [userId]);
  await run('DELETE FROM squad_snapshots WHERE user_id = ?', [userId]);

  await insertSnapshotRows('european_entries', europeData.entries);
  await insertSnapshotRows('european_standings', europeData.standings);
  await insertSnapshotRows('european_matches', europeData.matches);
  await insertSnapshotRows('european_draws', europeData.draws);
  await insertSnapshotRows('european_history', europeData.history);
  await insertSnapshotRows('european_awards', europeData.awards);
  await insertSnapshotRows('squad_snapshots', europeData.snapshots);
}

async function saveCurrentCareer(userId) {
  const active = await get('SELECT * FROM career_saves WHERE user_id = ? AND is_active = 1', [userId]);
  if (!active) return null;

  const club = await get('SELECT * FROM clubs WHERE user_id = ?', [userId]);
  const snapshot = await collectCareerSnapshot(userId);
  await run(`
    UPDATE career_saves
    SET team_id = ?, name = ?, current_day = ?, next_match_day = ?, week = ?,
      standings_json = ?, matches_json = ?, europe_json = ?, club_budget = ?,
      salary_budget = ?, season_json = ?, season_intro_seen = ?, season_summary_seen = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `, [
    club?.team_id || active.team_id,
    active.name,
    snapshot.state.current_day,
    snapshot.state.next_match_day,
    snapshot.state.week,
    JSON.stringify(snapshot.standings),
    JSON.stringify(snapshot.matchData),
    JSON.stringify(snapshot.europeData),
    club?.budget || active.club_budget || 0,
    club?.salary_budget || active.salary_budget || 0,
    club?.season_objectives_json || active.season_json || '{}',
    club?.season_intro_seen ?? active.season_intro_seen ?? 0,
    club?.season_summary_seen ?? active.season_summary_seen ?? 0,
    active.id,
    userId
  ]);
  return active;
}

async function ensureInitialCareerSave(userId) {
  await ensureCareerForUser(userId);
  const existing = await get('SELECT * FROM career_saves WHERE user_id = ? ORDER BY slot_number LIMIT 1', [userId]);
  if (existing) return existing;

  const club = await get('SELECT c.*, t.name AS team_name FROM clubs c LEFT JOIN teams t ON t.id = c.team_id WHERE c.user_id = ?', [userId]);
  const team = club?.team_id ? await get('SELECT * FROM teams WHERE id = ?', [club.team_id]) : null;
  const plan = parseSeasonPlan(club?.season_objectives_json, team || club || {});
  const snapshot = await collectCareerSnapshot(userId);
  const result = await run(`
    INSERT INTO career_saves
      (user_id, slot_number, team_id, name, current_day, next_match_day, week,
       standings_json, matches_json, europe_json, club_budget, salary_budget, season_json,
       season_intro_seen, season_summary_seen, is_active)
    VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `, [
    userId,
    club?.team_id || 1,
    club?.team_name || club?.name || 'Kariyer 1',
    snapshot.state.current_day,
    snapshot.state.next_match_day,
    snapshot.state.week,
    JSON.stringify(snapshot.standings),
    JSON.stringify(snapshot.matchData),
    JSON.stringify(snapshot.europeData),
    club?.budget || plan.transferBudget,
    club?.salary_budget || plan.salaryBudget,
    club?.season_objectives_json || JSON.stringify(plan),
    club?.season_intro_seen ?? 0,
    club?.season_summary_seen ?? 0
  ]);
  return get('SELECT * FROM career_saves WHERE id = ?', [result.id]);
}

async function listCareerSaves(userId) {
  await ensureInitialCareerSave(userId);
  await saveCurrentCareer(userId);
  return all(`
    SELECT cs.id, cs.slot_number, cs.team_id, cs.name, cs.current_day, cs.next_match_day, cs.week,
      cs.club_budget, cs.salary_budget, cs.is_active, cs.created_at, cs.updated_at, t.logo_url, t.city, t.stadium
    FROM career_saves cs
    LEFT JOIN teams t ON t.id = cs.team_id
    WHERE cs.user_id = ?
    ORDER BY cs.slot_number ASC
  `, [userId]);
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

async function restoreCareerSave(userId, saveId) {
  await saveCurrentCareer(userId);
  const career = await get('SELECT * FROM career_saves WHERE id = ? AND user_id = ?', [saveId, userId]);
  if (!career) throw new Error('Kariyer kaydı bulunamadı.');

  const team = await get('SELECT * FROM teams WHERE id = ?', [career.team_id]);
  await run('DELETE FROM match_player_ratings WHERE match_id IN (SELECT id FROM matches WHERE user_id = ?)', [userId]);
  await run('DELETE FROM match_events WHERE match_id IN (SELECT id FROM matches WHERE user_id = ?)', [userId]);
  await run('DELETE FROM matches WHERE user_id = ?', [userId]);
  await run('DELETE FROM league_standings WHERE user_id = ?', [userId]);
  await run(
    'UPDATE career_states SET current_day = ?, next_match_day = ?, week = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
    [career.current_day, career.next_match_day, career.week, userId]
  );
  const plan = parseSeasonPlan(career.season_json, team || {});
  await run(`UPDATE clubs
    SET team_id = ?, name = ?, currency = 'EUR', budget = ?, salary_budget = ?, season_objectives_json = ?,
      season_intro_seen = ?, season_summary_seen = ?, last_match = NULL
    WHERE user_id = ?`, [
    career.team_id,
    `${career.name} Kariyer ${userId}`,
    career.club_budget || plan.transferBudget,
    career.salary_budget || plan.salaryBudget,
    career.season_json || JSON.stringify(plan),
    career.season_intro_seen ?? 1,
    career.season_summary_seen ?? 0,
    userId
  ]);

  const standings = parseJson(career.standings_json, []);
  if (standings.length) {
    for (const row of standings) {
      await run(`
        INSERT INTO league_standings (user_id, team_id, points, wins, draws, losses, goals_for, goals_against, form)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [userId, row.team_id, row.points || 0, row.wins || 0, row.draws || 0, row.losses || 0, row.goals_for || 0, row.goals_against || 0, row.form || '']);
    }
  } else {
    await ensureCareerForUser(userId);
  }

  const matchData = parseJson(career.matches_json, { matches: [], events: [], ratings: [] });
  const europeData = parseJson(career.europe_json, { entries: [], matches: [], standings: [], draws: [], history: [], awards: [], snapshots: [] });
  const idMap = new Map();
  for (const match of matchData.matches || []) {
    const inserted = await run(`
      INSERT INTO matches
        (user_id, home_club_id, away_club_id, home_score, away_score, match_day, match_date, played,
         possession_home, shots_home, shots_away, shots_on_home, shots_on_away, pass_home, pass_away,
         fouls_home, fouls_away, corners_home, corners_away, offsides_home, offsides_away, xg_home, xg_away,
         saves_home, saves_away, tackles_home, tackles_away, successful_press_home, successful_press_away,
         tactic_score_home, tactic_score_away, tactical_summary, man_of_match)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId, match.home_club_id, match.away_club_id, match.home_score, match.away_score, match.match_day, match.match_date, match.played,
      match.possession_home, match.shots_home, match.shots_away, match.shots_on_home, match.shots_on_away, match.pass_home, match.pass_away,
      match.fouls_home, match.fouls_away, match.corners_home, match.corners_away, match.offsides_home, match.offsides_away, match.xg_home, match.xg_away,
      match.saves_home, match.saves_away, match.tackles_home, match.tackles_away, match.successful_press_home, match.successful_press_away,
      match.tactic_score_home, match.tactic_score_away, match.tactical_summary, match.man_of_match
    ]);
    idMap.set(match.id, inserted.id);
  }

  for (const event of matchData.events || []) {
    const matchId = idMap.get(event.match_id);
    if (!matchId) continue;
    await run(`
      INSERT INTO match_events
        (match_id, minute, event_text, event_type, is_highlight, team_id, scorer_id, assist_id, home_score, away_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [matchId, event.minute, event.event_text, event.event_type, event.is_highlight, event.team_id, event.scorer_id, event.assist_id, event.home_score, event.away_score]);
  }

  for (const rating of matchData.ratings || []) {
    const matchId = idMap.get(rating.match_id);
    if (!matchId) continue;
    await run(`
      INSERT INTO match_player_ratings
        (match_id, player_id, team_id, rating, goals, assists, yellow_cards, red_cards, injured)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [matchId, rating.player_id, rating.team_id, rating.rating, rating.goals, rating.assists, rating.yellow_cards, rating.red_cards, rating.injured]);
  }

  await restoreEuropeSnapshot(userId, europeData);

  await run('UPDATE career_saves SET is_active = 0 WHERE user_id = ?', [userId]);
  await run('UPDATE career_saves SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?', [saveId, userId]);
  return { ...career, team_name: team?.name || career.name };
}

async function createCareerSave(userId, teamId, name) {
  await ensureInitialCareerSave(userId);
  await saveCurrentCareer(userId);
  const count = await get('SELECT COUNT(*) AS count FROM career_saves WHERE user_id = ?', [userId]);
  if ((count?.count || 0) >= 5) throw new Error('En fazla 5 kariyer kaydı açabilirsiniz.');

  const team = await get('SELECT * FROM teams WHERE id = ?', [teamId]);
  if (!team) throw new Error('Seçilen takım bulunamadı.');
  const maxSlot = await get('SELECT COALESCE(MAX(slot_number), 0) AS slot FROM career_saves WHERE user_id = ?', [userId]);
  const slotNumber = Number(maxSlot?.slot || 0) + 1;
  const careerName = String(name || team.name).trim() || team.name;
  const plan = buildSeasonPlan(team);

  await run('UPDATE career_saves SET is_active = 0 WHERE user_id = ?', [userId]);
  await run(`UPDATE clubs
    SET team_id = ?, name = ?, currency = 'EUR', budget = ?, salary_budget = ?, season_objectives_json = ?,
      season_intro_seen = 0, season_summary_seen = 0, stadium_capacity = ?, fans = ?, last_match = NULL
    WHERE user_id = ?`, [
    team.id,
    `${careerName} Kariyer ${userId}`,
    plan.transferBudget,
    plan.salaryBudget,
    JSON.stringify(plan),
    Math.max(12000, Math.round((team.fans || 16000) / 1200)),
    team.fans || 16000,
    userId
  ]);
  await resetCareerProgress(userId);
  const snapshot = await collectCareerSnapshot(userId);
  const result = await run(`
    INSERT INTO career_saves
      (user_id, slot_number, team_id, name, current_day, next_match_day, week,
       standings_json, matches_json, europe_json, club_budget, salary_budget, season_json,
       season_intro_seen, season_summary_seen, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1)
  `, [
    userId,
    slotNumber,
    team.id,
    careerName,
    snapshot.state.current_day,
    snapshot.state.next_match_day,
    snapshot.state.week,
    JSON.stringify(snapshot.standings),
    JSON.stringify(snapshot.matchData),
    JSON.stringify(snapshot.europeData),
    plan.transferBudget,
    plan.salaryBudget,
    JSON.stringify(plan)
  ]);
  return get('SELECT * FROM career_saves WHERE id = ?', [result.id]);
}

async function getCareerState(userId) {
  return ensureCareerForUser(userId);
}

async function resetCareerProgress(userId = null) {
  if (userId) {
    await run('DELETE FROM match_player_ratings WHERE match_id IN (SELECT id FROM matches WHERE user_id = ?)', [userId]);
    await run('DELETE FROM match_events WHERE match_id IN (SELECT id FROM matches WHERE user_id = ?)', [userId]);
    await run('DELETE FROM matches WHERE user_id = ?', [userId]);
    await run('DELETE FROM european_awards WHERE user_id = ?', [userId]);
    await run('DELETE FROM european_history WHERE user_id = ?', [userId]);
    await run('DELETE FROM european_draws WHERE user_id = ?', [userId]);
    await run('DELETE FROM european_matches WHERE user_id = ?', [userId]);
    await run('DELETE FROM european_standings WHERE user_id = ?', [userId]);
    await run('DELETE FROM european_entries WHERE user_id = ?', [userId]);
    await run('DELETE FROM league_standings WHERE user_id = ?', [userId]);
    await run('UPDATE career_states SET current_day = 1, next_match_day = 7, week = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?', [userId]);
    await ensureCareerForUser(userId);
    return;
  }

  await run('DELETE FROM match_player_ratings');
  await run('DELETE FROM match_events');
  await run('DELETE FROM matches');
  await run('DELETE FROM european_awards');
  await run('DELETE FROM european_history');
  await run('DELETE FROM european_draws');
  await run('DELETE FROM european_matches');
  await run('DELETE FROM european_standings');
  await run('DELETE FROM european_entries');
  await run('DELETE FROM social_posts');
  await run('DELETE FROM news_feed');
  await run('DELETE FROM used_templates');
  await run('DELETE FROM training');
  await run('DELETE FROM training_results');
  await run('DELETE FROM transfers');
  await run('DELETE FROM transfer_interest');
  await run('DELETE FROM transfer_history');
  await run("UPDATE teams SET points = 0, wins = 0, draws = 0, losses = 0, goals_for = 0, goals_against = 0, form = ''");
  await run('UPDATE clubs SET points = 0, wins = 0, draws = 0, losses = 0, goals_for = 0, goals_against = 0, last_match = NULL');
  await run('UPDATE game_state SET current_day = 1, next_match_day = 7, week = 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1');
}

async function seedGalatasaraySon16Demo() {
  const oldDemo = await get("SELECT id FROM users WHERE username = 'gs_son16'");
  if (oldDemo?.id) await run('DELETE FROM users WHERE id = ?', [oldDemo.id]);

  const username = 'gs_temiz_son16';
  const email = 'gs_temiz_son16@tacticore.demo';
  const passwordHash = await bcrypt.hash('galatasaray16', 12);
  const team = await get("SELECT * FROM teams WHERE name = 'Galatasaray' LIMIT 1");
  if (!team) return;

  let user = await get('SELECT * FROM users WHERE username = ?', [username]);
  if (!user) {
    const created = await run('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', [username, email, passwordHash]);
    user = { id: created.id, username, email };
  } else {
    await run('UPDATE users SET email = ?, password_hash = ? WHERE id = ?', [email, passwordHash, user.id]);
  }

  const plan = buildSeasonPlan(team);
  let club = await get('SELECT * FROM clubs WHERE user_id = ?', [user.id]);
  if (!club) {
    const createdClub = await run(`
      INSERT INTO clubs
        (user_id, team_id, name, currency, budget, salary_budget, season_objectives_json, season_intro_seen, season_summary_seen, stadium_capacity, fans)
      VALUES (?, ?, ?, 'EUR', ?, ?, ?, 1, 0, ?, ?)
    `, [
      user.id,
      team.id,
      'Galatasaray Son 16 Demo',
      plan.transferBudget,
      plan.salaryBudget,
      JSON.stringify(plan),
      Math.max(12000, Math.round((team.fans || 54000000) / 1200)),
      team.fans || 54000000
    ]);
    club = { id: createdClub.id };
  } else {
    await run(`
      UPDATE clubs
      SET team_id = ?, name = ?, currency = 'EUR', budget = ?, salary_budget = ?, season_objectives_json = ?,
        season_intro_seen = 1, season_summary_seen = 0, last_match = NULL
      WHERE user_id = ?
    `, [team.id, 'Galatasaray Son 16 Demo', plan.transferBudget, plan.salaryBudget, JSON.stringify(plan), user.id]);
  }

  await resetCareerProgress(user.id);
  await run('DELETE FROM tactics WHERE club_id = ?', [club.id]);
  await run('INSERT INTO tactics (club_id, formation, mentality, pressing, passing_style, tempo) VALUES (?, ?, ?, ?, ?, ?)', [
    club.id,
    team.default_formation || '4-2-3-1',
    'balanced',
    58,
    'mixed',
    58
  ]);

  const week = 26;
  const currentDay = 207;
  await run('UPDATE career_states SET current_day = ?, next_match_day = ?, week = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?', [
    currentDay,
    leagueMatchDay(week),
    week,
    user.id
  ]);

  const teams = await all('SELECT * FROM teams ORDER BY overall DESC, id ASC');
  for (let index = 0; index < teams.length; index += 1) {
    const row = teams[index];
    const played = 25;
    const isGs = row.id === team.id;
    const points = isGs ? 58 : Math.max(18, 55 - index * 2);
    const wins = Math.floor(points / 3);
    const draws = points % 3;
    const losses = Math.max(0, played - wins - draws);
    const goalsFor = isGs ? 62 : Math.max(24, 54 - index);
    const goalsAgainst = isGs ? 24 : Math.max(20, 28 + index);
    await run(`
      UPDATE league_standings
      SET points = ?, wins = ?, draws = ?, losses = ?, goals_for = ?, goals_against = ?, form = ?
      WHERE user_id = ? AND team_id = ?
    `, [points, wins, draws, losses, goalsFor, goalsAgainst, isGs ? 'WWDWW' : 'WLWDW', user.id, row.id]);
  }

  await run('DELETE FROM european_awards WHERE user_id = ?', [user.id]);
  await run('DELETE FROM european_history WHERE user_id = ?', [user.id]);
  await run('DELETE FROM european_draws WHERE user_id = ?', [user.id]);
  await run('DELETE FROM european_matches WHERE user_id = ?', [user.id]);
  await run('DELETE FROM european_standings WHERE user_id = ?', [user.id]);
  await run('DELETE FROM european_entries WHERE user_id = ?', [user.id]);

  await run(`
    INSERT INTO european_entries (user_id, season, competition_code, team_id, source, entry_stage, status)
    VALUES (?, 2025, 'UCL', ?, 'Demo Son 16', 'round_of_16', 'active')
  `, [user.id, team.id]);
  await run(`
    INSERT INTO european_standings (user_id, season, competition_code, team_id, played, wins, draws, losses, goals_for, goals_against, points)
    VALUES (?, 2025, 'UCL', ?, 8, 5, 2, 1, 17, 8, 17)
  `, [user.id, team.id]);

  const euroTeams = await all('SELECT * FROM european_teams ORDER BY overall DESC, pot ASC LIMIT 23');
  const selected = euroTeams.slice(0, 15);
  for (let index = 0; index < euroTeams.length; index += 1) {
    const euro = euroTeams[index];
    await run(`
      INSERT INTO european_entries (user_id, season, competition_code, european_team_id, source, entry_stage, status)
      VALUES (?, 2025, 'UCL', ?, 'UEFA demo', 'round_of_16', 'active')
    `, [user.id, euro.id]);
    await run(`
      INSERT INTO european_standings
        (user_id, season, competition_code, european_team_id, played, wins, draws, losses, goals_for, goals_against, points)
      VALUES (?, 2025, 'UCL', ?, 8, ?, ?, ?, ?, ?, ?)
    `, [
      user.id,
      euro.id,
      Math.max(2, 6 - (index % 4)),
      index % 3,
      Math.max(0, 2 - (index % 2)),
      Math.max(9, 18 - index),
      Math.max(6, 8 + index),
      Math.max(9, 18 - index)
    ]);
  }

  const participants = [
    { teamId: team.id, europeanTeamId: null, name: team.name },
    ...selected.map((item) => ({ teamId: null, europeanTeamId: item.id, name: item.name }))
  ];
  const pairs = [];
  for (let index = 0; index < participants.length / 2; index += 1) {
    pairs.push([participants[index], participants[participants.length - 1 - index]]);
  }
  for (const [home, away] of pairs) {
    await run(`
      INSERT INTO european_matches
        (user_id, season, competition_code, phase, round_name, leg, match_day, match_date, home_team_id, away_team_id, home_european_team_id, away_european_team_id)
      VALUES (?, 2025, 'UCL', 'round_of_16', 'Son 16', 1, 207, ?, ?, ?, ?, ?)
    `, [user.id, seasonDate(207), home.teamId, away.teamId, home.europeanTeamId, away.europeanTeamId]);
    await run(`
      INSERT INTO european_matches
        (user_id, season, competition_code, phase, round_name, leg, match_day, match_date, home_team_id, away_team_id, home_european_team_id, away_european_team_id)
      VALUES (?, 2025, 'UCL', 'round_of_16', 'Son 16', 2, 214, ?, ?, ?, ?, ?)
    `, [user.id, seasonDate(214), away.teamId, home.teamId, away.europeanTeamId, home.europeanTeamId]);
  }
  await run(`
    INSERT INTO european_draws (user_id, season, competition_code, phase, draw_data)
    VALUES (?, 2025, 'UCL', 'round_of_16', ?)
  `, [user.id, JSON.stringify({ roundName: 'Son 16', participants: pairs })]);
  await run(`
    INSERT INTO news_feed (day, category, title, summary, template_key, team_id)
    VALUES (?, 'europe', 'Şampiyonlar Ligi Son 16 kurası çekildi', ?, 'demo_son16_draw', ?)
  `, [currentDay, `Galatasaray Son 16 turunda ${pairs[0][1].name} ile eşleşti. İlk maç ${seasonDate(207)} tarihinde.`, team.id]);
  await run(`
    INSERT INTO social_posts (day, type, author, content, template_key, category, team_id)
    VALUES (?, 'social', 'UEFA Haber Merkezi', ?, 'demo_son16_draw_social', 'europe', ?)
  `, [currentDay, `Galatasaray için Son 16 kurası çekildi. Rakip: ${pairs[0][1].name}.`, team.id]);

  await ensureInitialCareerSave(user.id);
}

async function initDatabase() {
  await createSchema();
  await run('INSERT OR IGNORE INTO game_state (id, current_day, next_match_day, week) VALUES (1, 1, 7, 1)');
  await seedSuperLigData({ run, get, all });
  await seedEuropeanData({ run, get, all });
  await backfillPlayerTransferData();
  await backfillMatchDays();
  await backfillSeasonPlans();
  await seedTransferMarket();
  await seedGalatasaraySon16Demo();
  const users = await all('SELECT id, username FROM users');
  for (const user of users) {
    await run('INSERT OR IGNORE INTO manager_profiles (user_id, manager_name) VALUES (?, ?)', [user.id, user.username]);
    await ensureCareerForUser(user.id);
    await ensureInitialCareerSave(user.id);
  }
}

async function backfillPlayerTransferData() {
  const players = await all(`
    SELECT p.*, t.overall AS team_overall
    FROM players p
    LEFT JOIN teams t ON t.id = p.team_id
    WHERE p.potential = 70 OR p.contract_until = 2027 OR p.happiness = 70 OR p.playing_time = 50
    LIMIT 5000
  `);

  for (const player of players) {
    const potential = Math.max(player.overall, Math.min(95, player.overall + (player.age <= 21 ? 9 : player.age <= 24 ? 6 : player.age >= 31 ? 1 : 3)));
    const contractUntil = player.contract_until && player.contract_until !== 2027
      ? player.contract_until
      : 2026 + ((player.id % 4) + 1);
    const happinessBase = 62 + (player.morale || 70) * 0.22 + (player.lineup_role === 'starter' ? 10 : player.lineup_role === 'substitute' ? 2 : -8);
    const happiness = Math.max(25, Math.min(96, Math.round(happinessBase + ((player.id % 9) - 4))));
    const playingTime = player.lineup_role === 'starter' ? 82 : player.lineup_role === 'substitute' ? 48 : 24;
    const transferStatus = player.transfer_status && player.transfer_status !== 'normal'
      ? player.transfer_status
      : happiness < 48 ? 'unhappy' : contractUntil <= 2026 ? 'expiring' : player.age <= 21 && potential >= 78 ? 'hot_prospect' : 'normal';
    const loanAvailable = player.loan_available || (player.age <= 22 && player.lineup_role !== 'starter' ? 1 : 0);

    await run(`
      UPDATE players
      SET potential = ?, contract_until = ?, happiness = ?, playing_time = ?, transfer_status = ?, loan_available = ?
      WHERE id = ?
    `, [potential, contractUntil, happiness, playingTime, transferStatus, loanAvailable, player.id]);
  }
}

module.exports = {
  db,
  run,
  get,
  all,
  initDatabase,
  insertPlayersForClub,
  resetCareerProgress,
  ensureCareerForUser,
  getCareerState,
  listCareerSaves,
  saveCurrentCareer,
  restoreCareerSave,
  createCareerSave,
  ensureInitialCareerSave,
  seedGalatasaraySon16Demo
};
