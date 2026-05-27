const { all, get, run } = require('../database');
const { seasonDate } = require('./seasonCalendar');
const { lineupForTeam } = require('./matchEngine');
const { calculateTeamStrength } = require('./overallCalculator');
const { QUALIFICATION_RULES } = require('../seed/uefaSeed');

const SEASON = 2025;
const WIN_ONLY_WORDS = ['3 puan', 'galibiyet', 'zafer', 'kazandı', 'kutladı'];
const EURO_DAYS = {
  UCL: [24, 31, 66, 87, 136, 165, 172, 193],
  UEL: [17, 45, 73, 101, 129, 157],
  UECL: [21, 49, 77, 105, 133, 161]
};
const QUALIFYING_DAYS = {
  UCL: [10, 17],
  UEL: [8, 15],
  UECL: [12, 19]
};
const KNOCKOUT_DAYS = {
  UCL: { round_of_16: 207, quarter_final: 242, semi_final: 270, final: 303 },
  UEL: { round_of_16: 207, quarter_final: 242, semi_final: 270, final: 300 },
  UECL: { round_of_16: 214, quarter_final: 249, semi_final: 277, final: 299 }
};
const KNOCKOUT_SECOND_LEG_GAP = 7;
const PRIZE = {
  UCL: { win: 2800000, draw: 930000, participation: 18000000, round: 11000000 },
  UEL: { win: 900000, draw: 300000, participation: 4300000, round: 2500000 },
  UECL: { win: 500000, draw: 166000, participation: 3200000, round: 1200000 }
};
const COMPETITION_TYPE_BY_CODE = {
  UCL: 'champions_league',
  UEL: 'europa_league',
  UECL: 'conference_league'
};
const QUALIFICATION_PRIORITY = {
  UCL_league_phase: 50,
  UCL_qualifying: 40,
  UEL_league_phase: 30,
  UEL_qualifying: 25,
  UECL_league_phase: 15,
  UECL_qualifying: 10
};
const KNOCKOUT_SEQUENCE = [
  { phase: 'round_of_16', roundName: 'Son 16', size: 16 },
  { phase: 'quarter_final', roundName: 'Çeyrek Final', size: 8 },
  { phase: 'semi_final', roundName: 'Yarı Final', size: 4 },
  { phase: 'final', roundName: 'Final', size: 2 }
];

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function activeUserId(userId) {
  return Number(userId || 0) || null;
}

async function careerState(userId) {
  if (!userId) return get('SELECT * FROM game_state WHERE id = 1');
  const state = await get('SELECT * FROM career_states WHERE user_id = ?', [userId]);
  return state || { current_day: 1, next_match_day: 7, week: 1 };
}

function pick(items, index = rand(0, items.length - 1)) {
  return items[Math.abs(index) % items.length];
}

function getResultType(goalsFor, goalsAgainst) {
  if (goalsFor > goalsAgainst) return 'win';
  if (goalsFor < goalsAgainst) return 'loss';
  return 'draw';
}

function validateNewsText(text, resultType) {
  if (resultType === 'win') return true;
  const lowered = String(text || '').toLowerCase();
  return !WIN_ONLY_WORDS.some((word) => lowered.includes(word.toLowerCase()));
}

function buildEuropeanSocialTemplates() {
  const win = [
    '{team} Avrupa sahnesinde ışıl ışıl oynadı 🔥 #{competition}',
    '{team} bu gece ülke puanını sırtladı. Dev iş!',
    '{competition} atmosferi başka, {team} de buna yakıştı.',
    'Bu oyun Avrupa seviyesinde. {team} taraftarı gururlu.',
    '{team} deplasmanda bile karakter koydu. #AvrupaGecesi'
  ];
  const draw = [
    '{team} Avrupa gecesinden 1 puanla çıktı. Denge vardı.',
    'Beraberlik kötü değil ama kaçan fırsatlar konuşulur.',
    '{team} için Avrupa’da kontrollü gece. 1 puan cepte.',
    'Oyun fena değil, bitiricilik biraz daha iyi olmalı.',
    '{competition} temposunda denge bozulmadı.'
  ];
  const loss = [
    '{team} Avrupa’da puan alamadı. Tepki özellikle savunmaya.',
    'Bu seviyede hatanın bedeli ağır oluyor.',
    '{team} için moral bozucu gece. Reaksiyon şart.',
    'Avrupa’da tempo yüksek, {team} bugün zorlandı.',
    'Taraftar üzgün ama rövanş için umut tamamen bitmedi.'
  ];
  const tones = ['Tribün yorumu:', 'Analiz:', 'Hater modu:', 'Pozitif bakış:', 'Spor hesabı:', 'Maç sonu:', 'Taktik notu:', 'Gündem:'];
  const tags = ['#TactiCore', '#Avrupa', '#UEFA', '#ÜlkePuanı'];
  const build = (requiredResult, list) => tones.flatMap((tone) => list.flatMap((text) => tags.map((tag) => ({
    requiredResult,
    text: `${tone} ${text} ${tag}`
  }))));
  return [...build('win', win), ...build('draw', draw), ...build('loss', loss)];
}

function buildEuropeanNewsTemplates() {
  const winTitles = ['Avrupa’da Tarihi Gece', '{team} Avrupa Sahnesinde Parladı', '{competition} Gecesinde Büyük Sevinç', 'Türk Temsilcisinden Güçlü Mesaj'];
  const drawTitles = ['Avrupa’da Dengeli Gece', '{team} Sahadan 1 Puanla Ayrıldı', '{competition} Maçında Denge Bozulmadı', 'Kritik Avrupa Randevusunda Puan Paylaşıldı'];
  const lossTitles = ['Avrupa’da Zor Gece', '{team} Puan Alamadan Döndü', '{competition} Maçında Hayal Kırıklığı', 'Taraftar Avrupa Reaksiyonu Bekliyor'];
  const summaries = {
    win: ['{score} sonrası {team} cephesinde moraller yükseldi. Taktik disiplin ve tempo maçın anahtarı oldu.', '{team}, {opponent} karşısında Avrupa seviyesinde bir oyun ortaya koydu.'],
    draw: ['{score} sonrası {team} hanesine 1 puan yazdırdı. Kaçan fırsatlar maçın kırılma anı oldu.', '{team}, {opponent} karşısında dengeli oyunu bozamadı ama yarışta kaldı.'],
    loss: ['{score} sonrası {team} cephesinde moral bozukluğu var. Teknik ekipten hızlı reaksiyon bekleniyor.', '{team}, {opponent} karşısında puan alamadı. Avrupa temposu hataları affetmedi.']
  };
  const make = (requiredResult, titles) => titles.flatMap((title) => summaries[requiredResult].map((summary) => ({ requiredResult, title, summary })));
  const base = [...make('win', winTitles), ...make('draw', drawTitles), ...make('loss', lossTitles)];
  const expanded = [];
  for (let i = 0; i < 12; i += 1) {
    for (const template of base) expanded.push({ ...template, key: `euro_news_${template.requiredResult}_${expanded.length}` });
  }
  return expanded;
}

const EURO_SOCIAL_TEMPLATES = buildEuropeanSocialTemplates();
const EURO_NEWS_TEMPLATES = buildEuropeanNewsTemplates();

function render(template, data) {
  return String(template)
    .replaceAll('{team}', data.team)
    .replaceAll('{opponent}', data.opponent)
    .replaceAll('{competition}', data.competition)
    .replaceAll('{score}', data.score);
}

async function qualificationRules() {
  const row = await get("SELECT draw_data FROM european_draws WHERE competition_code = 'CONFIG' AND phase = 'qualification_rules' ORDER BY id DESC LIMIT 1");
  if (!row?.draw_data) return QUALIFICATION_RULES;
  try {
    return JSON.parse(row.draw_data);
  } catch {
    return QUALIFICATION_RULES;
  }
}

async function resetEuropeanSeasonIfNeeded() {
  const version = await get("SELECT id FROM european_draws WHERE competition_code = 'CONFIG' AND phase = 'qualification_version_v2' LIMIT 1");
  if (version) return;

  // Only generated UEFA season data is rebuilt; user accounts, squads, transfers and league history stay untouched.
  await run('DELETE FROM european_matches WHERE season = ?', [SEASON]);
  await run('DELETE FROM european_standings WHERE season = ?', [SEASON]);
  await run('DELETE FROM european_entries WHERE season = ?', [SEASON]);
  await run("DELETE FROM european_draws WHERE season = ? AND competition_code != 'CONFIG'", [SEASON]);
  await run('DELETE FROM european_awards WHERE season = ?', [SEASON]);
  await run('DELETE FROM european_history WHERE season = ?', [SEASON]);
  await run(`
    INSERT INTO european_draws (season, competition_code, phase, draw_data)
    VALUES (?, 'CONFIG', 'qualification_version_v2', ?)
  `, [SEASON, JSON.stringify({ version: 2, rule: 'domestic_league_and_cup_only' })]);
}

async function repairEuropeanCalendarBacklog(userId = null) {
  // Geciken Avrupa maclari ileri tasinmaz. Eski mantik kura gununu de ileri
  // kaciriyordu; mac tarihi gecmisteyse oyuncu direkt o maci oynayabilmeli.
  return { userId: activeUserId(userId), repaired: 0 };
}

async function repairEuropeanKnockoutTiming(userId = null) {
  const scopedUserId = activeUserId(userId);
  for (const competitionCode of ['UCL', 'UEL', 'UECL']) {
    for (const phaseInfo of KNOCKOUT_SEQUENCE) {
      const baseDay = KNOCKOUT_DAYS[competitionCode]?.[phaseInfo.phase];
      if (!baseDay) continue;
      const matches = await all(`
        SELECT id, leg, match_day
        FROM european_matches
        WHERE user_id = ? AND season = ? AND competition_code = ? AND phase = ? AND played = 0
        ORDER BY leg ASC, id ASC
      `, [scopedUserId, SEASON, competitionCode, phaseInfo.phase]);
      for (const match of matches) {
        const targetDay = baseDay + (Number(match.leg || 1) === 2 ? KNOCKOUT_SECOND_LEG_GAP : 0);
        if (Number(match.match_day || 0) === targetDay) continue;
        await run('UPDATE european_matches SET match_day = ?, match_date = ? WHERE id = ?', [
          targetDay,
          seasonDate(targetDay),
          match.id
        ]);
      }
    }
  }
}

async function repairEuropeanScheduleTiming(userId = null) {
  const scopedUserId = activeUserId(userId);
  const localEntrants = await all('SELECT team_id FROM european_entries WHERE user_id = ? AND season = ? AND team_id IS NOT NULL', [scopedUserId, SEASON]);
  const localTeamIds = localEntrants.map((entry) => Number(entry.team_id)).filter(Boolean);
  if (!localTeamIds.length) return;
  for (const code of ['UCL']) {
    for (const teamId of localTeamIds) {
      const rows = await all(`
        SELECT id, phase, played
        FROM european_matches
        WHERE user_id = ? AND season = ? AND competition_code = ? AND phase IN ('qualifying', 'league')
          AND (home_team_id = ? OR away_team_id = ?)
        ORDER BY phase, played DESC, match_day ASC, id ASC
      `, [scopedUserId, SEASON, code, teamId, teamId]);
      const counters = {};
      for (const row of rows) {
        const list = row.phase === 'qualifying' ? QUALIFYING_DAYS[code] : EURO_DAYS[code];
        const index = counters[row.phase] || 0;
        counters[row.phase] = index + 1;
        if (row.played) continue;
        const day = list[Math.min(index, list.length - 1)] + Math.floor(index / list.length) * 7;
        await run('UPDATE european_matches SET match_day = ?, match_date = ? WHERE id = ?', [day, seasonDate(day), row.id]);
      }
    }
  }
}

async function ensureEuropeanLeagueFixtureCount(userId = null) {
  const scopedUserId = activeUserId(userId);
  const competitionCode = 'UCL';
  const euroOpponents = await all(`
    SELECT ee.european_team_id, et.overall
    FROM european_entries ee
    JOIN european_teams et ON et.id = ee.european_team_id
    WHERE ee.user_id = ? AND ee.season = ? AND ee.competition_code = ? AND ee.european_team_id IS NOT NULL
    ORDER BY et.pot ASC, et.overall DESC
  `, [scopedUserId, SEASON, competitionCode]);
  if (!euroOpponents.length) return;

  const localEntrants = await all(`
    SELECT *
    FROM european_entries
    WHERE user_id = ? AND season = ? AND competition_code = ? AND team_id IS NOT NULL AND entry_stage IN ('league_phase', 'league')
  `, [scopedUserId, SEASON, competitionCode]);

  for (const entry of localEntrants) {
    const existing = await all(`
      SELECT *
      FROM european_matches
      WHERE user_id = ? AND season = ? AND competition_code = ? AND phase = 'league'
        AND (home_team_id = ? OR away_team_id = ?)
      ORDER BY match_day ASC, id ASC
    `, [scopedUserId, SEASON, competitionCode, entry.team_id, entry.team_id]);
    if (existing.length >= EURO_DAYS[competitionCode].length) continue;

    const used = new Set(existing.map((match) => match.home_european_team_id || match.away_european_team_id).filter(Boolean));
    const available = euroOpponents.filter((opponent) => !used.has(opponent.european_team_id));
    for (let i = existing.length; i < EURO_DAYS[competitionCode].length && available.length; i += 1) {
      const opponent = available.shift();
      const homeLocal = i % 2 === 0;
      await run(`
        INSERT INTO european_matches
          (user_id, season, competition_code, phase, round_name, leg, match_day, match_date, home_team_id, away_team_id, home_european_team_id, away_european_team_id)
        VALUES (?, ?, ?, 'league', 'Lig Aşaması', 1, ?, ?, ?, ?, ?, ?)
      `, [
        scopedUserId,
        SEASON,
        competitionCode,
        EURO_DAYS[competitionCode][i],
        seasonDate(EURO_DAYS[competitionCode][i]),
        homeLocal ? entry.team_id : null,
        homeLocal ? null : entry.team_id,
        homeLocal ? null : opponent.european_team_id,
        homeLocal ? opponent.european_team_id : null
      ]);
    }
  }
}

async function domesticTable(userId = null) {
  if (userId) {
    return all(`
      SELECT t.*, ls.points, ls.wins, ls.draws, ls.losses, ls.goals_for, ls.goals_against, ls.form,
        (ls.wins + ls.draws + ls.losses) AS played,
        (ls.goals_for - ls.goals_against) AS goal_difference
      FROM league_standings ls
      JOIN teams t ON t.id = ls.team_id
      WHERE ls.user_id = ?
      ORDER BY ls.points DESC, goal_difference DESC, ls.goals_for DESC, t.overall DESC, t.name ASC
    `, [userId]);
  }
  return all(`
    SELECT *, (wins + draws + losses) AS played, (goals_for - goals_against) AS goal_difference
    FROM teams
    ORDER BY points DESC, goal_difference DESC, goals_for DESC, overall DESC, name ASC
  `);
}

function normalizeEntryStage(stage) {
  if (stage === 'league' || stage === 'league_phase') return 'league_phase';
  if (stage === 'playoff' || stage === 'qualifying') return 'qualifying';
  return stage || 'league_phase';
}

function qualificationPriority(item) {
  return QUALIFICATION_PRIORITY[`${item.competition}_${normalizeEntryStage(item.entryRound || item.stage)}`] || 0;
}

function nextEligibleStanding(standings, usedTeamIds, startIndex = 0) {
  for (let index = startIndex; index < standings.length; index += 1) {
    const teamId = standings[index].teamId || standings[index].id;
    if (!usedTeamIds.has(teamId)) return { item: standings[index], index };
  }
  return null;
}

function assignEuropeanQualification(superLigStandings, turkishCupWinner = null) {
  const standings = superLigStandings.map((team, index) => ({ ...team, teamId: team.teamId || team.id, rank: index + 1 }));
  const used = new Set();
  const qualifications = [];

  const addLeagueSlot = (rank, competitionCode, entryRound, reason) => {
    const preferredIndex = rank - 1;
    const candidate = nextEligibleStanding(standings, used, preferredIndex);
    if (!candidate) return;
    used.add(candidate.item.teamId);
    qualifications.push({
      teamId: candidate.item.teamId,
      teamName: candidate.item.name,
      competition: competitionCode,
      entryRound,
      reason,
      sourceRank: candidate.item.rank
    });
  };

  addLeagueSlot(1, 'UCL', 'league_phase', 'Süper Lig 1.si');
  addLeagueSlot(2, 'UCL', 'qualifying', 'Süper Lig 2.si');
  addLeagueSlot(3, 'UEL', 'league_phase', 'Süper Lig 3.sü');

  if (turkishCupWinner?.teamId) {
    const existing = qualifications.find((item) => item.teamId === turkishCupWinner.teamId);
    const cupSlot = {
      teamId: turkishCupWinner.teamId,
      teamName: turkishCupWinner.name || turkishCupWinner.teamName,
      competition: 'UEL',
      entryRound: 'qualifying',
      reason: 'Türkiye Kupası şampiyonu',
      sourceRank: turkishCupWinner.rank || null
    };
    if (!existing) {
      used.add(cupSlot.teamId);
      qualifications.push(cupSlot);
    } else if (qualificationPriority(cupSlot) > qualificationPriority(existing)) {
      existing.competition = cupSlot.competition;
      existing.entryRound = cupSlot.entryRound;
      existing.reason = `${existing.reason} + Türkiye Kupası şampiyonu, daha yüksek kontenjan`;
    }
  }

  addLeagueSlot(4, 'UECL', 'qualifying', 'Süper Lig 4.sü / boşalan kontenjan');

  return qualifications.sort((a, b) => qualificationPriority(b) - qualificationPriority(a));
}

async function turkishCupWinnerFromConfig(table) {
  const row = await get("SELECT draw_data FROM european_draws WHERE competition_code = 'CONFIG' AND phase = 'turkish_cup_winner' ORDER BY id DESC LIMIT 1");
  if (!row?.draw_data) return null;
  try {
    const parsed = JSON.parse(row.draw_data);
    const teamId = Number(parsed.teamId || parsed.id);
    const team = table.find((item) => item.id === teamId);
    return team ? { teamId: team.id, name: team.name, rank: table.findIndex((item) => item.id === team.id) + 1 } : null;
  } catch {
    return null;
  }
}

function participantKey(match, side) {
  const teamId = match[`${side}_team_id`];
  const euroId = match[`${side}_european_team_id`];
  return teamId ? `T${teamId}` : `E${euroId}`;
}

function participantKeys(match) {
  return [participantKey(match, 'home'), participantKey(match, 'away')]
    .filter((key) => !key.endsWith('null') && !key.endsWith('undefined') && key !== 'E0' && key !== 'T0');
}

async function repairEuropeanDuplicateFixtures(userId = null) {
  const scopedUserId = activeUserId(userId);
  const groups = await all(`
    SELECT competition_code, match_day
    FROM european_matches
    WHERE user_id = ? AND season = ?
    GROUP BY competition_code, match_day
    ORDER BY match_day ASC
  `, [scopedUserId, SEASON]);
  const removed = [];

  for (const group of groups) {
    const matches = await all(`
      SELECT *
      FROM european_matches
      WHERE user_id = ? AND season = ? AND competition_code = ? AND match_day = ?
      ORDER BY
        CASE WHEN home_team_id IS NOT NULL OR away_team_id IS NOT NULL THEN 0 ELSE 1 END,
        id ASC
    `, [scopedUserId, SEASON, group.competition_code, group.match_day]);
    const busy = new Set();

    for (const match of matches) {
      const keys = participantKeys(match);
      if (keys.some((key) => busy.has(key))) {
        await run('DELETE FROM european_matches WHERE id = ?', [match.id]);
        removed.push({ id: match.id, competition: match.competition_code, day: match.match_day, participants: keys });
      } else {
        keys.forEach((key) => busy.add(key));
      }
    }
  }

  if (removed.length) {
    console.log('CALENDAR CHECK', {
      duplicateEuropeanFixturesRemoved: removed.length,
      removed
    });
  }
}

async function teamBySide(match, side) {
  const teamId = match[`${side}_team_id`];
  const euroId = match[`${side}_european_team_id`];
  if (teamId) {
    const team = await get('SELECT * FROM teams WHERE id = ?', [teamId]);
    return { ...team, source: 'local', team_id: team.id, country: 'Türkiye', league: 'Süper Lig' };
  }
  const team = await get('SELECT * FROM european_teams WHERE id = ?', [euroId]);
  return { ...team, id: euroId, source: 'europe', european_team_id: euroId };
}

async function competition(code) {
  return get('SELECT * FROM european_competitions WHERE code = ?', [code]);
}

async function ensureStanding({ userId = null, competitionCode, teamId = null, europeanTeamId = null }) {
  const scopedUserId = activeUserId(userId);
  const existing = await get(`
    SELECT id FROM european_standings
    WHERE user_id = ? AND season = ? AND competition_code = ? AND COALESCE(team_id, 0) = COALESCE(?, 0) AND COALESCE(european_team_id, 0) = COALESCE(?, 0)
    LIMIT 1
  `, [scopedUserId, SEASON, competitionCode, teamId, europeanTeamId]);
  if (existing) return;
  await run(`
    INSERT INTO european_standings (user_id, season, competition_code, team_id, european_team_id)
    VALUES (?, ?, ?, ?, ?)
  `, [scopedUserId, SEASON, competitionCode, teamId, europeanTeamId]);
}

async function insertEntry({ userId = null, competitionCode, teamId = null, europeanTeamId = null, source, entryStage = 'league' }) {
  const scopedUserId = activeUserId(userId);
  const existing = await get(`
    SELECT id FROM european_entries
    WHERE user_id = ? AND season = ? AND competition_code = ? AND COALESCE(team_id, 0) = COALESCE(?, 0) AND COALESCE(european_team_id, 0) = COALESCE(?, 0)
    LIMIT 1
  `, [scopedUserId, SEASON, competitionCode, teamId, europeanTeamId]);
  if (existing) {
    await ensureStanding({ userId: scopedUserId, competitionCode, teamId, europeanTeamId });
    return;
  }
  await run(`
    INSERT INTO european_entries (user_id, season, competition_code, team_id, european_team_id, source, entry_stage)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [scopedUserId, SEASON, competitionCode, teamId, europeanTeamId, source, entryStage]);
  await ensureStanding({ userId: scopedUserId, competitionCode, teamId, europeanTeamId });
}

async function scheduleLeagueStageForLocalEntry(userId, competitionCode, teamId, startAfterDay = 0) {
  const scopedUserId = activeUserId(userId);
  const existing = await get(`
    SELECT id FROM european_matches
    WHERE user_id = ? AND season = ? AND competition_code = ? AND phase = 'league'
      AND played = 0 AND (home_team_id = ? OR away_team_id = ?)
    LIMIT 1
  `, [scopedUserId, SEASON, competitionCode, teamId, teamId]);
  if (existing) return;

  const euroOpponents = await all(`
    SELECT ee.european_team_id, et.overall
    FROM european_entries ee
    JOIN european_teams et ON et.id = ee.european_team_id
    WHERE ee.user_id = ? AND ee.season = ? AND ee.competition_code = ? AND ee.european_team_id IS NOT NULL
    ORDER BY et.pot ASC, et.overall DESC
  `, [scopedUserId, SEASON, competitionCode]);
  if (!euroOpponents.length) return;

  const days = EURO_DAYS[competitionCode].filter((day) => day > startAfterDay);
  const usableDays = days.length ? days : EURO_DAYS[competitionCode].map((day) => day + 7);
  const rivals = [...euroOpponents].sort(() => Math.random() - 0.5).slice(0, usableDays.length);
  const drawRows = [];

  for (let i = 0; i < rivals.length; i += 1) {
    const homeLocal = i % 2 === 0;
    await run(`
      INSERT INTO european_matches
        (user_id, season, competition_code, phase, round_name, leg, match_day, match_date, home_team_id, away_team_id, home_european_team_id, away_european_team_id)
      VALUES (?, ?, ?, 'league', 'Lig Aşaması', 1, ?, ?, ?, ?, ?, ?)
    `, [
      scopedUserId,
      SEASON,
      competitionCode,
      usableDays[i],
      seasonDate(usableDays[i]),
      homeLocal ? teamId : null,
      homeLocal ? null : teamId,
      homeLocal ? null : rivals[i].european_team_id,
      homeLocal ? rivals[i].european_team_id : null
    ]);
    drawRows.push({ competition: competitionCode, team_id: teamId, opponent_european_team_id: rivals[i].european_team_id, day: usableDays[i], home: homeLocal });
  }

  await run(`
    INSERT INTO european_draws (user_id, season, competition_code, phase, draw_data)
    VALUES (?, ?, ?, 'league_stage_after_qualifying', ?)
  `, [scopedUserId, SEASON, competitionCode, JSON.stringify(drawRows)]);
}

async function scheduleExternalLeagueFixtures(userId, competitionCode) {
  const scopedUserId = activeUserId(userId);
  const state = await careerState(scopedUserId);
  const currentDay = Number(state?.current_day || 1);
  const leagueDays = await all(`
    SELECT DISTINCT match_day
    FROM european_matches
    WHERE user_id = ? AND season = ? AND competition_code = ? AND phase = 'league' AND played = 0 AND match_day >= ?
    ORDER BY match_day ASC
  `, [scopedUserId, SEASON, competitionCode, currentDay]);
  if (!leagueDays.length) return;

  const externalEntrants = await all(`
    SELECT ee.european_team_id, et.overall
    FROM european_entries ee
    JOIN european_teams et ON et.id = ee.european_team_id
    WHERE ee.user_id = ? AND ee.season = ? AND ee.competition_code = ? AND ee.european_team_id IS NOT NULL
    ORDER BY et.pot ASC, et.overall DESC
  `, [scopedUserId, SEASON, competitionCode]);
  if (externalEntrants.length < 2) return;

  for (const row of leagueDays) {
    const existing = await get(`
      SELECT COUNT(*) AS count
      FROM european_matches
      WHERE user_id = ? AND season = ? AND competition_code = ? AND phase = 'league' AND match_day = ?
        AND home_european_team_id IS NOT NULL AND away_european_team_id IS NOT NULL
    `, [scopedUserId, SEASON, competitionCode, row.match_day]);
    if (existing?.count) continue;

    const busyRows = await all(`
      SELECT *
      FROM european_matches
      WHERE user_id = ? AND season = ? AND competition_code = ? AND match_day = ?
    `, [scopedUserId, SEASON, competitionCode, row.match_day]);
    const roundBusy = new Set(busyRows.flatMap((match) => participantKeys(match)));
    const availableEntrants = externalEntrants.filter((entry) => !roundBusy.has(`E${entry.european_team_id}`));
    const rotation = row.match_day % Math.max(1, availableEntrants.length);
    const rotated = [...availableEntrants.slice(rotation), ...availableEntrants.slice(0, rotation)];
    for (let i = 0; i + 1 < rotated.length; i += 2) {
      const homeKey = `E${rotated[i].european_team_id}`;
      const awayKey = `E${rotated[i + 1].european_team_id}`;
      if (roundBusy.has(homeKey) || roundBusy.has(awayKey)) continue;
      await run(`
        INSERT INTO european_matches
          (user_id, season, competition_code, phase, round_name, leg, match_day, match_date, home_european_team_id, away_european_team_id)
        VALUES (?, ?, ?, 'league', 'Lig Aşaması', 1, ?, ?, ?, ?)
      `, [scopedUserId, SEASON, competitionCode, row.match_day, seasonDate(row.match_day), rotated[i].european_team_id, rotated[i + 1].european_team_id]);
      roundBusy.add(homeKey);
      roundBusy.add(awayKey);
    }
  }
}

async function createSquadSnapshot(userIdOrClubId, clubOrTeamId = null, teamId = null) {
  const hasUserScope = teamId !== null || clubOrTeamId !== null;
  const scopedUserId = hasUserScope ? activeUserId(userIdOrClubId) : null;
  const effectiveClubOrTeamId = hasUserScope ? clubOrTeamId : userIdOrClubId;
  const effectiveTeamId = teamId || effectiveClubOrTeamId;
  const state = await careerState(scopedUserId);
  const club = teamId ? { id: effectiveClubOrTeamId, team_id: teamId } : await get('SELECT * FROM clubs WHERE team_id = ? ORDER BY user_id IS NULL ASC LIMIT 1', [effectiveClubOrTeamId]);
  const players = await all('SELECT * FROM players WHERE team_id = ? ORDER BY id ASC', [effectiveTeamId]);
  if (!players.length) return null;
  const snapshot = players.map((player) => ({
    id: player.id,
    team_id: player.team_id,
    club_id: player.club_id,
    lineup_role: player.lineup_role,
    is_starting_eleven: player.is_starting_eleven,
    injured: player.injured,
    stamina: player.stamina,
    morale: player.morale
  }));
  return run(`
    INSERT INTO squad_snapshots (user_id, club_id, team_id, week, day, snapshot_data)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [scopedUserId, club?.id || null, effectiveTeamId, state?.week || 1, state?.current_day || 1, JSON.stringify(snapshot)]);
}

async function restoreLastSquadSnapshot(teamId) {
  const snapshot = await get('SELECT * FROM squad_snapshots WHERE team_id = ? ORDER BY id DESC LIMIT 1', [teamId]);
  if (!snapshot) return { restored: 0, message: 'Sağlam kadro kaydı bulunamadı.' };
  const players = JSON.parse(snapshot.snapshot_data || '[]');
  for (const player of players) {
    await run(`
      UPDATE players
      SET team_id = ?, club_id = ?, lineup_role = ?, is_starting_eleven = ?, injured = ?, stamina = ?, morale = ?
      WHERE id = ?
    `, [player.team_id, player.club_id, player.lineup_role, player.is_starting_eleven, player.injured, player.stamina, player.morale, player.id]);
  }
  return { restored: players.length, message: 'Kadro son sağlam kayıttan onarıldı.' };
}

async function ensureEuropeanSeason(userIdOrTeamId = null, maybeUserTeamId = null) {
  const scopedUserId = maybeUserTeamId === null ? null : activeUserId(userIdOrTeamId);
  const userTeamId = maybeUserTeamId === null ? userIdOrTeamId : maybeUserTeamId;
  await resetEuropeanSeasonIfNeeded();
  const existing = await get('SELECT COUNT(*) AS count FROM european_entries WHERE user_id = ? AND season = ?', [scopedUserId, SEASON]);
  if (existing?.count) {
    await ensureEuropeanLeagueFixtureCount(scopedUserId);
    await repairEuropeanScheduleTiming(scopedUserId);
    await repairEuropeanKnockoutTiming(scopedUserId);
    for (const comp of ['UCL', 'UEL', 'UECL']) await scheduleExternalLeagueFixtures(scopedUserId, comp);
    await repairEuropeanDuplicateFixtures(scopedUserId);
    await repairEuropeanCalendarBacklog(scopedUserId);
    await repairEuropeanDuplicateFixtures(scopedUserId);
    return { ready: true, created: false, userTeamId };
  }

  const table = await domesticTable(scopedUserId);
  const cupWinner = await turkishCupWinnerFromConfig(table);
  const qualifications = assignEuropeanQualification(table, cupWinner);
  const external = await all('SELECT * FROM european_teams ORDER BY overall DESC, pot ASC');
  const drawRows = [];

  console.log('EUROPEAN QUALIFICATION CHECK', {
    superLigStandings: table.slice(0, 8).map((team, index) => ({ rank: index + 1, teamId: team.id, name: team.name })),
    turkishCupWinner: cupWinner,
    qualifications: qualifications.map((item) => ({
      teamId: item.teamId,
      teamName: item.teamName,
      competition: COMPETITION_TYPE_BY_CODE[item.competition],
      entryRound: item.entryRound,
      reason: item.reason
    }))
  });

  for (const qualification of qualifications) {
    const team = table.find((item) => item.id === qualification.teamId);
    if (!team) continue;
    await insertEntry({
      userId: scopedUserId,
      competitionCode: qualification.competition,
      teamId: team.id,
      source: qualification.reason,
      entryStage: qualification.entryRound
    });
    await createSquadSnapshot(scopedUserId, team.id);
    const comp = await competition(qualification.competition);
    await run(`
      INSERT INTO european_history (user_id, season, competition_code, team_id, event_type, description, money_award, prestige_delta, fan_delta, day)
      VALUES (?, ?, ?, ?, 'qualification', ?, ?, 2, 1500, 1)
    `, [scopedUserId, SEASON, qualification.competition, team.id, `${team.name}, ${comp.short_name} için Avrupa bileti aldı.`, PRIZE[qualification.competition].participation]);
    const club = scopedUserId
      ? await get('SELECT * FROM clubs WHERE user_id = ? AND team_id = ?', [scopedUserId, team.id])
      : await get('SELECT * FROM clubs WHERE team_id = ?', [team.id]);
    if (club) await run('UPDATE clubs SET budget = budget + ?, fans = fans + 1500 WHERE id = ?', [PRIZE[qualification.competition].participation, club.id]);
  }

  for (const comp of ['UCL', 'UEL', 'UECL']) {
    const locals = await all('SELECT * FROM european_entries WHERE user_id = ? AND season = ? AND competition_code = ? AND team_id IS NOT NULL', [scopedUserId, SEASON, comp]);
    const needed = Math.max(20, 24 - locals.length);
    const offset = comp === 'UCL' ? 0 : comp === 'UEL' ? 12 : 24;
    for (const team of external.slice(offset, offset + needed)) {
      await insertEntry({ userId: scopedUserId, competitionCode: comp, europeanTeamId: team.id, source: 'UEFA seed', entryStage: 'league' });
    }
    const entrants = await all('SELECT * FROM european_entries WHERE user_id = ? AND season = ? AND competition_code = ?', [scopedUserId, SEASON, comp]);
    const euroOpponents = entrants.filter((entry) => entry.european_team_id);
    const localEntrants = entrants.filter((entry) => entry.team_id);
    const days = EURO_DAYS[comp];

    for (const entry of localEntrants) {
      if (normalizeEntryStage(entry.entry_stage) === 'qualifying' && euroOpponents.length) {
        const playoffOpponent = euroOpponents[(entry.team_id + comp.length) % euroOpponents.length];
        for (const leg of [1, 2]) {
          const homeLocal = leg === 2;
          const day = QUALIFYING_DAYS[comp]?.[leg - 1] || (leg === 1 ? 15 : 19);
          await run(`
            INSERT INTO european_matches
              (user_id, season, competition_code, phase, round_name, leg, match_day, match_date, home_team_id, away_team_id, home_european_team_id, away_european_team_id)
            VALUES (?, ?, ?, 'qualifying', 'Play-Off', ?, ?, ?, ?, ?, ?, ?)
          `, [
            scopedUserId,
            SEASON,
            comp,
            leg,
            day,
            seasonDate(day),
            homeLocal ? entry.team_id : null,
            homeLocal ? null : entry.team_id,
            homeLocal ? null : playoffOpponent.european_team_id,
            homeLocal ? playoffOpponent.european_team_id : null
          ]);
        }
        drawRows.push({ competition: comp, phase: 'playoff', team_id: entry.team_id, opponent_european_team_id: playoffOpponent.european_team_id, day: 8, two_legged: true });
      }
      if (normalizeEntryStage(entry.entry_stage) !== 'league_phase') continue;
      const rivals = [...euroOpponents].sort(() => Math.random() - 0.5).slice(0, days.length);
      for (let i = 0; i < rivals.length; i += 1) {
        const homeLocal = i % 2 === 0;
        await run(`
          INSERT INTO european_matches
            (user_id, season, competition_code, phase, round_name, leg, match_day, match_date, home_team_id, away_team_id, home_european_team_id, away_european_team_id)
          VALUES (?, ?, ?, 'league', 'Lig Aşaması', 1, ?, ?, ?, ?, ?, ?)
        `, [
          scopedUserId,
          SEASON,
          comp,
          days[i],
          seasonDate(days[i]),
          homeLocal ? entry.team_id : null,
          homeLocal ? null : entry.team_id,
          homeLocal ? null : rivals[i].european_team_id,
          homeLocal ? rivals[i].european_team_id : null
        ]);
        drawRows.push({ competition: comp, team_id: entry.team_id, opponent_european_team_id: rivals[i].european_team_id, day: days[i], home: homeLocal });
      }
    }
    await run(`
      INSERT INTO european_draws (user_id, season, competition_code, phase, draw_data)
      VALUES (?, ?, ?, 'league_stage', ?)
    `, [scopedUserId, SEASON, comp, JSON.stringify(drawRows.filter((row) => row.competition === comp))]);
    for (const entry of localEntrants.filter((item) => normalizeEntryStage(item.entry_stage) === 'league_phase')) {
      const localTeam = await get('SELECT * FROM teams WHERE id = ?', [entry.team_id]);
      const opponents = drawRows
        .filter((row) => row.competition === comp && row.team_id === entry.team_id && row.opponent_european_team_id)
        .map((row) => euroOpponents.find((opponent) => opponent.european_team_id === row.opponent_european_team_id))
        .filter(Boolean)
        .slice(0, 8);
      const opponentNames = [];
      for (const opponent of opponents) {
        const team = await get('SELECT name FROM european_teams WHERE id = ?', [opponent.european_team_id]);
        if (team?.name) opponentNames.push(team.name);
      }
      await run(`
        INSERT INTO news_feed (day, category, title, summary, template_key, team_id)
        VALUES (?, 'europe', ?, ?, 'ucl_group_draw', ?)
      `, [
        Math.max(1, days[0] - 7),
        `${comp === 'UCL' ? 'Şampiyonlar Ligi' : comp} grup kuraları çekildi`,
        `${localTeam?.name || 'Takım'} için rakipler belli oldu: ${opponentNames.join(', ') || 'fikstür UEFA tarafından açıklandı'}.`,
        entry.team_id
      ]);
      await run(`
        INSERT INTO social_posts (day, type, author, content, template_key, category, team_id)
        VALUES (?, 'social', 'UEFA Haber Merkezi', ?, 'ucl_group_draw_social', 'europe', ?)
      `, [
        Math.max(1, days[0] - 7),
        `${localTeam?.name || 'Takım'} için Şampiyonlar Ligi grup/lig aşaması kurası çekildi. Rakipler: ${opponentNames.slice(0, 4).join(', ') || 'belli oldu'}.`,
        entry.team_id
      ]);
    }
    await scheduleExternalLeagueFixtures(scopedUserId, comp);
  }

  await repairEuropeanDuplicateFixtures(scopedUserId);
  await repairEuropeanScheduleTiming(scopedUserId);
  await repairEuropeanKnockoutTiming(scopedUserId);
  await repairEuropeanCalendarBacklog(scopedUserId);
  await repairEuropeanDuplicateFixtures(scopedUserId);
  return { ready: true, created: true, userTeamId };
}

function expectedGoals(home, away, isHome) {
  const homeAdv = isHome ? 0.18 : 0;
  const attackEdge = ((home.attack_overall || home.overall) - (away.defense_overall || away.overall)) / 30;
  const midfieldEdge = ((home.midfield_overall || home.overall) - (away.midfield_overall || away.overall)) / 55;
  return clamp(1.15 + homeAdv + attackEdge + midfieldEdge + (Math.random() * 0.5 - 0.2), 0.35, 3.4);
}

function goalsFromXg(xg) {
  let goals = 0;
  const chances = Math.max(3, Math.round(xg * 4));
  for (let i = 0; i < chances; i += 1) {
    if (Math.random() < clamp(xg / 8, 0.055, 0.34)) goals += 1;
  }
  return goals;
}

function syntheticEuropeanPlayers(team) {
  const base = team.short_name || team.name.split(' ')[0];
  return [
    { id: null, name: `${base} Kalecisi`, position: 'GK', passing: 55, shooting: 20, defending: 70, overall: team.goalkeeper_overall || team.overall },
    { id: null, name: `${base} Stoperi`, position: 'DEF', passing: 62, shooting: 35, defending: team.defense_overall || team.overall, overall: team.overall },
    { id: null, name: `${base} Bek`, position: 'DEF', passing: 66, shooting: 40, defending: team.defense_overall || team.overall, overall: team.overall },
    { id: null, name: `${base} Oyun Kurucu`, position: 'MID', passing: team.midfield_overall || team.overall, shooting: 62, defending: 58, overall: team.overall },
    { id: null, name: `${base} Kanat`, position: 'MID', passing: 72, shooting: team.attack_overall || team.overall, defending: 42, overall: team.overall },
    { id: null, name: `${base} Forvet`, position: 'FWD', passing: 65, shooting: team.attack_overall || team.overall, defending: 32, overall: team.overall }
  ];
}

async function playersForTeamEntity(team) {
  if (team.source !== 'local') return syntheticEuropeanPlayers(team);
  const players = await lineupForTeam(team.id);
  return players.length ? players : syntheticEuropeanPlayers(team);
}

function weightedPick(players, positions = null, skill = 'overall') {
  const pool = positions ? players.filter((player) => positions.includes(player.position)) : players;
  const source = pool.length ? pool : players;
  const total = source.reduce((sum, player) => sum + Math.max(1, Number(player[skill] || player.overall || 60)), 0);
  let roll = Math.random() * total;
  for (const player of source) {
    roll -= Math.max(1, Number(player[skill] || player.overall || 60));
    if (roll <= 0) return player;
  }
  return source[0];
}

function pickPlayerForEvent(players, eventType) {
  if (eventType === 'goal') return weightedPick(players, ['FWD', 'MID'], 'shooting');
  if (eventType === 'assist') return weightedPick(players, ['MID', 'FWD'], 'passing');
  if (eventType === 'attack') return weightedPick(players, ['FWD', 'MID'], 'pace');
  if (eventType === 'save') return players.find((player) => player.position === 'GK') || weightedPick(players);
  if (eventType === 'defense') return weightedPick(players, ['DEF', 'MID'], 'defending');
  return weightedPick(players);
}

function logEventPlayer(eventType, player, team) {
  console.log('EVENT PLAYER CHECK', {
    eventType,
    selectedPlayer: player?.name || '-',
    selectedTeam: team?.name || '-'
  });
}

async function simulateEuropeanMatch(match) {
  const [home, away] = await Promise.all([teamBySide(match, 'home'), teamBySide(match, 'away')]);
  if (home.source === 'local') {
    const lineup = await lineupForTeam(home.id);
    const power = calculateTeamStrength(lineup, home, { home: true });
    home.overall = power.total;
    home.attack_overall = power.attack;
    home.midfield_overall = power.midfield;
    home.defense_overall = power.defense;
    home.goalkeeper_overall = power.goalkeeper;
  }
  if (away.source === 'local') {
    const lineup = await lineupForTeam(away.id);
    const power = calculateTeamStrength(lineup, away, { home: false });
    away.overall = power.total;
    away.attack_overall = power.attack;
    away.midfield_overall = power.midfield;
    away.defense_overall = power.defense;
    away.goalkeeper_overall = power.goalkeeper;
  }
  const [homePlayers, awayPlayers] = await Promise.all([
    playersForTeamEntity(home),
    playersForTeamEntity(away)
  ]);

  const xgHome = expectedGoals(home, away, true);
  const xgAway = expectedGoals(away, home, false);
  let homeScore = goalsFromXg(xgHome);
  let awayScore = goalsFromXg(xgAway);
  if (homeScore + awayScore === 0 && Math.random() < 0.72) {
    if (Math.random() < xgHome / (xgHome + xgAway)) homeScore += 1;
    else awayScore += 1;
  }
  const possessionHome = clamp(Math.round(50 + ((home.midfield_overall || home.overall) - (away.midfield_overall || away.overall)) * 0.7), 32, 68);
  const events = [
    { minute: 1, event_type: 'commentary', event_text: `${match.competition_code} gecesi başladı. ${home.name} ve ${away.name} Avrupa sahnesinde karşı karşıya.`, is_highlight: 0, home_score: 0, away_score: 0 },
    { minute: rand(8, 24), event_type: 'commentary', event_text: `${home.name} tribünlerin desteğiyle tempoyu artırıyor.`, is_highlight: 0, home_score: 0, away_score: 0 },
    { minute: rand(25, 42), event_type: 'save', event_text: `${away.name} tehlikeli geldi, kaleci kritik kurtarış yaptı.`, is_highlight: 1, home_score: 0, away_score: 0 }
  ];
  const homeWinger = pickPlayerForEvent(homePlayers, 'attack');
  const awayShooter = pickPlayerForEvent(awayPlayers, 'goal');
  const homeKeeper = pickPlayerForEvent(homePlayers, 'save');
  logEventPlayer('attack', homeWinger, home);
  logEventPlayer('save', homeKeeper, home);
  events.push({
    minute: rand(10, 28),
    event_type: 'miss',
    event_text: `${homeWinger.name} sağ kanattan etkili geldi, ceza sahasına çevirdi ama savunma son anda uzaklaştırdı.`,
    is_highlight: 1,
    team_id: home.team_id || null,
    playerName: homeWinger.name,
    home_score: 0,
    away_score: 0
  });
  events.push({
    minute: rand(30, 44),
    event_type: 'save',
    event_text: `${awayShooter.name} karşı karşıya kaldı ama ${homeKeeper.name} harika bir kurtarış yaptı!`,
    is_highlight: 1,
    team_id: away.team_id || null,
    playerName: awayShooter.name,
    home_score: 0,
    away_score: 0
  });
  let liveHome = 0;
  let liveAway = 0;
  for (let i = 0; i < homeScore; i += 1) {
    liveHome += 1;
    const scorer = pickPlayerForEvent(homePlayers, 'goal');
    const assist = pickPlayerForEvent(homePlayers.filter((player) => player.name !== scorer.name), 'assist');
    logEventPlayer('goal', scorer, home);
    events.push({
      minute: rand(18, 88),
      event_type: 'goal',
      event_text: `GOOOOL! ${assist?.name || home.name} pasında ${scorer.name} topu ağlara gönderdi!`,
      is_highlight: 1,
      score_side: 'home',
      team_id: home.team_id || null,
      scorer_id: scorer.id || null,
      scorer_name: scorer.name,
      assist_id: assist?.id || null,
      assist_name: assist?.name || null,
      playerName: scorer.name,
      assistPlayerName: assist?.name || null,
      home_score: liveHome,
      away_score: liveAway
    });
  }
  for (let i = 0; i < awayScore; i += 1) {
    liveAway += 1;
    const scorer = pickPlayerForEvent(awayPlayers, 'goal');
    const assist = pickPlayerForEvent(awayPlayers.filter((player) => player.name !== scorer.name), 'assist');
    logEventPlayer('goal', scorer, away);
    events.push({
      minute: rand(18, 88),
      event_type: 'goal',
      event_text: `GOOOOL! ${assist?.name || away.name} pasında ${scorer.name} topu ağlara gönderdi!`,
      is_highlight: 1,
      score_side: 'away',
      team_id: away.team_id || null,
      scorer_id: scorer.id || null,
      scorer_name: scorer.name,
      assist_id: assist?.id || null,
      assist_name: assist?.name || null,
      playerName: scorer.name,
      assistPlayerName: assist?.name || null,
      home_score: liveHome,
      away_score: liveAway
    });
  }
  events.push({ minute: 90, event_type: 'commentary', event_text: `Avrupa maçı bitti. Skor: ${home.name} ${homeScore}-${awayScore} ${away.name}.`, is_highlight: 0, home_score: homeScore, away_score: awayScore });
  events.sort((a, b) => a.minute - b.minute);
  let chronologicalHome = 0;
  let chronologicalAway = 0;
  for (const eventItem of events) {
    if (eventItem.event_type === 'goal') {
      if (eventItem.score_side === 'home') chronologicalHome += 1;
      if (eventItem.score_side === 'away') chronologicalAway += 1;
      eventItem.home_score = chronologicalHome;
      eventItem.away_score = chronologicalAway;
    } else if (eventItem.minute < 90) {
      eventItem.home_score = chronologicalHome;
      eventItem.away_score = chronologicalAway;
    }
  }

  const stats = {
    possession_home: possessionHome,
    shots_home: Math.max(homeScore + 4, Math.round(xgHome * 5 + rand(2, 5))),
    shots_away: Math.max(awayScore + 4, Math.round(xgAway * 5 + rand(2, 5))),
    shots_on_home: Math.max(homeScore, Math.round(xgHome * 2.2 + rand(1, 3))),
    shots_on_away: Math.max(awayScore, Math.round(xgAway * 2.2 + rand(1, 3))),
    xg_home: Number(xgHome.toFixed(2)),
    xg_away: Number(xgAway.toFixed(2)),
    tactical_summary: `${home.name} Avrupa temposunda ${possessionHome}% topa sahip oldu. ${away.name} geçişlerde cevap aradı.`
  };

  await run(`
    UPDATE european_matches
    SET home_score = ?, away_score = ?, played = 1, possession_home = ?, shots_home = ?, shots_away = ?,
      shots_on_home = ?, shots_on_away = ?, xg_home = ?, xg_away = ?, event_log = ?, tactical_summary = ?
    WHERE id = ?
  `, [homeScore, awayScore, stats.possession_home, stats.shots_home, stats.shots_away, stats.shots_on_home, stats.shots_on_away, stats.xg_home, stats.xg_away, JSON.stringify(events), stats.tactical_summary, match.id]);

  if (match.phase === 'qualifying' && match.leg === 2) {
    await settleQualifyingTie(match, home, away, homeScore, awayScore);
  }
  if (['round_of_16', 'quarter_final', 'semi_final', 'final'].includes(match.phase)) {
    await settleKnockoutTie(match, home, away, homeScore, awayScore);
  }

  if (match.phase === 'league') await updateEuropeanStandings(match, homeScore, awayScore);
  await applyEuropeanRewards(match, home, away, homeScore, awayScore);
  await createEuropeanStories(match, home, away, homeScore, awayScore);

  return {
    match: {
      id: match.id,
      european: true,
      competitionType: COMPETITION_TYPE_BY_CODE[match.competition_code],
      competition_type: COMPETITION_TYPE_BY_CODE[match.competition_code],
      competition_code: match.competition_code,
      round_name: match.round_name,
      home_score: homeScore,
      away_score: awayScore,
      pass_home: clamp(72 + (possessionHome - 50) * 0.2, 55, 92),
      pass_away: clamp(72 + (50 - possessionHome) * 0.2, 55, 92),
      fouls_home: rand(8, 16),
      fouls_away: rand(8, 16),
      corners_home: rand(2, 8),
      corners_away: rand(2, 8),
      offsides_home: rand(0, 4),
      offsides_away: rand(0, 4),
      saves_home: Math.max(0, stats.shots_on_away - awayScore),
      saves_away: Math.max(0, stats.shots_on_home - homeScore),
      tackles_home: rand(12, 26),
      tackles_away: rand(12, 26),
      successful_press_home: rand(8, 24),
      successful_press_away: rand(8, 24),
      tactic_score_home: clamp(Math.round(home.overall + rand(-8, 8)), 45, 99),
      tactic_score_away: clamp(Math.round(away.overall + rand(-8, 8)), 45, 99),
      man_of_match: homeScore >= awayScore ? home.name : away.name,
      ...stats
    },
    home,
    away,
    events,
    stats,
    playerRatings: await europeanRatings(home, away)
  };
}

async function simulateEuropeanBotMatch(match) {
  const [home, away] = await Promise.all([teamBySide(match, 'home'), teamBySide(match, 'away')]);
  const xgHome = expectedGoals(home, away, true);
  const xgAway = expectedGoals(away, home, false);
  let homeScore = goalsFromXg(xgHome);
  let awayScore = goalsFromXg(xgAway);
  if (homeScore + awayScore === 0 && Math.random() < 0.65) {
    if (Math.random() < xgHome / (xgHome + xgAway)) homeScore += 1;
    else awayScore += 1;
  }

  const possessionHome = clamp(Math.round(50 + ((home.midfield_overall || home.overall) - (away.midfield_overall || away.overall)) * 0.55), 34, 66);
  const stats = {
    possession_home: possessionHome,
    shots_home: Math.max(homeScore + 4, Math.round(xgHome * 4.6 + rand(1, 4))),
    shots_away: Math.max(awayScore + 4, Math.round(xgAway * 4.6 + rand(1, 4))),
    shots_on_home: Math.max(homeScore, Math.round(xgHome * 2 + rand(1, 2))),
    shots_on_away: Math.max(awayScore, Math.round(xgAway * 2 + rand(1, 2))),
    xg_home: Number(xgHome.toFixed(2)),
    xg_away: Number(xgAway.toFixed(2)),
    tactical_summary: `${home.name} ile ${away.name} Avrupa haftasındaki maçını tamamladı.`
  };
  const events = [
    {
      minute: 90,
      event_type: 'commentary',
      event_text: `${home.name} ${homeScore}-${awayScore} ${away.name}.`,
      is_highlight: 0,
      home_score: homeScore,
      away_score: awayScore
    }
  ];

  await run(`
    UPDATE european_matches
    SET home_score = ?, away_score = ?, played = 1, possession_home = ?, shots_home = ?, shots_away = ?,
      shots_on_home = ?, shots_on_away = ?, xg_home = ?, xg_away = ?, event_log = ?, tactical_summary = ?
    WHERE id = ?
  `, [homeScore, awayScore, stats.possession_home, stats.shots_home, stats.shots_away, stats.shots_on_home, stats.shots_on_away, stats.xg_home, stats.xg_away, JSON.stringify(events), stats.tactical_summary, match.id]);

  if (match.phase === 'qualifying' && match.leg === 2) {
    await settleQualifyingTie(match, home, away, homeScore, awayScore);
  }
  if (['round_of_16', 'quarter_final', 'semi_final', 'final'].includes(match.phase)) {
    await settleKnockoutTie(match, home, away, homeScore, awayScore);
  }

  if (match.phase === 'league') await updateEuropeanStandings(match, homeScore, awayScore);
  await applyEuropeanRewards(match, home, away, homeScore, awayScore);
  await createEuropeanStories(match, home, away, homeScore, awayScore);

  return {
    match: {
      id: match.id,
      european: true,
      competitionType: COMPETITION_TYPE_BY_CODE[match.competition_code],
      competition_type: COMPETITION_TYPE_BY_CODE[match.competition_code],
      competition_code: match.competition_code,
      round_name: match.round_name,
      home_score: homeScore,
      away_score: awayScore,
      pass_home: clamp(72 + (possessionHome - 50) * 0.2, 55, 92),
      pass_away: clamp(72 + (50 - possessionHome) * 0.2, 55, 92),
      fouls_home: rand(8, 16),
      fouls_away: rand(8, 16),
      corners_home: rand(2, 8),
      corners_away: rand(2, 8),
      offsides_home: rand(0, 4),
      offsides_away: rand(0, 4),
      saves_home: Math.max(0, stats.shots_on_away - awayScore),
      saves_away: Math.max(0, stats.shots_on_home - homeScore),
      tackles_home: rand(12, 26),
      tackles_away: rand(12, 26),
      successful_press_home: rand(8, 24),
      successful_press_away: rand(8, 24),
      tactic_score_home: clamp(Math.round(home.overall + rand(-8, 8)), 45, 99),
      tactic_score_away: clamp(Math.round(away.overall + rand(-8, 8)), 45, 99),
      man_of_match: homeScore >= awayScore ? home.name : away.name,
      ...stats
    },
    home,
    away,
    events,
    stats,
    playerRatings: []
  };
}

async function settleQualifyingTie(match, home, away, homeScore, awayScore) {
  const firstLeg = await get(`
    SELECT * FROM european_matches
    WHERE user_id = ? AND season = ? AND competition_code = ? AND phase = 'qualifying' AND round_name = ? AND leg = 1
      AND ((home_team_id = ? OR away_team_id = ? OR home_european_team_id = ? OR away_european_team_id = ?)
      AND (home_team_id = ? OR away_team_id = ? OR home_european_team_id = ? OR away_european_team_id = ?))
    ORDER BY id DESC LIMIT 1
  `, [
    activeUserId(match.user_id),
    SEASON,
    match.competition_code,
    match.round_name,
    home.team_id || null,
    home.team_id || null,
    home.european_team_id || null,
    home.european_team_id || null,
    away.team_id || null,
    away.team_id || null,
    away.european_team_id || null,
    away.european_team_id || null
  ]);
  if (!firstLeg) return;
  const firstHomeKey = participantKey(firstLeg, 'home');
  const currentHomeKey = participantKey(match, 'home');
  const homeAggregate = homeScore + (firstHomeKey === currentHomeKey ? firstLeg.home_score : firstLeg.away_score);
  const awayAggregate = awayScore + (firstHomeKey === currentHomeKey ? firstLeg.away_score : firstLeg.home_score);
  let penaltiesHome = null;
  let penaltiesAway = null;
  let winner = homeAggregate > awayAggregate ? home : away;
  if (homeAggregate === awayAggregate) {
    penaltiesHome = rand(3, 6);
    penaltiesAway = rand(3, 6);
    if (penaltiesHome === penaltiesAway) penaltiesHome += 1;
    winner = penaltiesHome > penaltiesAway ? home : away;
  }
  await run('UPDATE european_matches SET aggregate_home = ?, aggregate_away = ?, penalties_home = ?, penalties_away = ? WHERE id = ?', [
    homeAggregate,
    awayAggregate,
    penaltiesHome,
    penaltiesAway,
    match.id
  ]);
  for (const side of [home, away]) {
    if (side.source !== 'local') continue;
    const advanced = side.name === winner.name;
    if (advanced) {
      await run(`
        UPDATE european_entries
        SET status = 'active', entry_stage = 'league_phase'
        WHERE user_id = ? AND season = ? AND competition_code = ? AND team_id = ?
      `, [activeUserId(match.user_id), SEASON, match.competition_code, side.id]);
      await scheduleLeagueStageForLocalEntry(match.user_id, match.competition_code, side.id, match.match_day);
    } else {
      await run(`
        UPDATE european_entries
        SET status = 'eliminated'
        WHERE user_id = ? AND season = ? AND competition_code = ? AND team_id = ?
      `, [activeUserId(match.user_id), SEASON, match.competition_code, side.id]);
    }
    await run(`
      INSERT INTO european_history (user_id, season, competition_code, team_id, event_type, description, money_award, prestige_delta, fan_delta, day)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      activeUserId(match.user_id),
      SEASON,
      match.competition_code,
      side.id,
      advanced ? 'qualified' : 'eliminated',
      penaltiesHome === null
        ? `${side.name} toplamda ${side === home ? homeAggregate : awayAggregate}-${side === home ? awayAggregate : homeAggregate} ${advanced ? 'ile tur atladı' : 'ile elendi'}.`
        : `${side.name} penaltılarla ${advanced ? 'tur atladı' : 'elendi'}.`,
      advanced ? PRIZE[match.competition_code].round : 0,
      advanced ? 4 : -2,
      advanced ? 2500 : -900,
      match.match_day
    ]);
    if (!advanced) {
      const state = await careerState(match.user_id);
      await run(`
        INSERT INTO news_feed (day, category, title, summary, template_key, team_id, match_id)
        VALUES (?, 'europe', ?, ?, 'europe_eliminated', ?, ?)
      `, [
        state?.current_day || match.match_day,
        `${side.name} İçin Avrupa Macerası Sona Erdi`,
        `${side.name}, ${match.round_name} turunda elendi. Takım bu sezon alt turnuvaya düşmeyecek, Avrupa defteri burada kapandı.`,
        side.id,
        match.id
      ]);
    }
  }
}

async function settleKnockoutTie(match, home, away, homeScore, awayScore) {
  if (match.phase === 'final') {
    let penaltiesHome = null;
    let penaltiesAway = null;
    if (homeScore === awayScore) {
      penaltiesHome = rand(3, 6);
      penaltiesAway = rand(3, 6);
      if (penaltiesHome === penaltiesAway) penaltiesHome += 1;
    }
    await run('UPDATE european_matches SET aggregate_home = ?, aggregate_away = ?, penalties_home = ?, penalties_away = ? WHERE id = ?', [
      homeScore,
      awayScore,
      penaltiesHome,
      penaltiesAway,
      match.id
    ]);
    return;
  }
  if (Number(match.leg || 1) !== 2) return;
  const firstLeg = await get(`
    SELECT * FROM european_matches
    WHERE user_id = ? AND season = ? AND competition_code = ? AND phase = ? AND round_name = ? AND leg = 1
      AND ((home_team_id = ? OR away_team_id = ? OR home_european_team_id = ? OR away_european_team_id = ?)
      AND (home_team_id = ? OR away_team_id = ? OR home_european_team_id = ? OR away_european_team_id = ?))
    ORDER BY id DESC LIMIT 1
  `, [
    activeUserId(match.user_id),
    SEASON,
    match.competition_code,
    match.phase,
    match.round_name,
    home.team_id || null,
    home.team_id || null,
    home.european_team_id || null,
    home.european_team_id || null,
    away.team_id || null,
    away.team_id || null,
    away.european_team_id || null,
    away.european_team_id || null
  ]);
  if (!firstLeg) return;
  const firstHomeKey = participantKey(firstLeg, 'home');
  const currentHomeKey = participantKey(match, 'home');
  const homeAggregate = homeScore + (firstHomeKey === currentHomeKey ? firstLeg.home_score : firstLeg.away_score);
  const awayAggregate = awayScore + (firstHomeKey === currentHomeKey ? firstLeg.away_score : firstLeg.home_score);
  let penaltiesHome = null;
  let penaltiesAway = null;
  if (homeAggregate === awayAggregate) {
    penaltiesHome = rand(3, 6);
    penaltiesAway = rand(3, 6);
    if (penaltiesHome === penaltiesAway) penaltiesHome += 1;
  }
  await run('UPDATE european_matches SET aggregate_home = ?, aggregate_away = ?, penalties_home = ?, penalties_away = ? WHERE id = ?', [
    homeAggregate,
    awayAggregate,
    penaltiesHome,
    penaltiesAway,
    match.id
  ]);
}

function participantFromStanding(row) {
  return {
    teamId: row.team_id || null,
    europeanTeamId: row.european_team_id || null,
    name: row.name
  };
}

function participantFromMatch(match, side) {
  return {
    teamId: match[`${side}_team_id`] || null,
    europeanTeamId: match[`${side}_european_team_id`] || null
  };
}

function knockoutWinner(match) {
  if (match.aggregate_home !== null && match.aggregate_home !== undefined && Number(match.aggregate_home) !== Number(match.aggregate_away)) {
    return Number(match.aggregate_home) > Number(match.aggregate_away) ? participantFromMatch(match, 'home') : participantFromMatch(match, 'away');
  }
  if (match.penalties_home !== null && match.penalties_home !== undefined && Number(match.penalties_home) !== Number(match.penalties_away)) {
    return Number(match.penalties_home) > Number(match.penalties_away) ? participantFromMatch(match, 'home') : participantFromMatch(match, 'away');
  }
  if (Number(match.home_score) > Number(match.away_score)) return participantFromMatch(match, 'home');
  if (Number(match.away_score) > Number(match.home_score)) return participantFromMatch(match, 'away');
  const homePower = Number(match.home_score || 0) + Math.random();
  const awayPower = Number(match.away_score || 0) + Math.random();
  return homePower >= awayPower ? participantFromMatch(match, 'home') : participantFromMatch(match, 'away');
}

async function knockoutPhaseCount(userId, competitionCode, phase) {
  const scopedUserId = activeUserId(userId);
  const row = await get(`
    SELECT COUNT(*) AS count
    FROM european_matches
    WHERE user_id = ? AND season = ? AND competition_code = ? AND phase = ?
  `, [scopedUserId, SEASON, competitionCode, phase]);
  return Number(row?.count || 0);
}

function knockoutMatchDay(competitionCode, phase, fallbackDay = 0) {
  return KNOCKOUT_DAYS[competitionCode]?.[phase] || Number(fallbackDay || 0);
}

async function createKnockoutRound(userId, competitionCode, phaseInfo, participants, baseDay, rankedPairing = false) {
  const scopedUserId = activeUserId(userId);
  if (participants.length < phaseInfo.size) return false;
  if (await knockoutPhaseCount(scopedUserId, competitionCode, phaseInfo.phase)) return false;
  const needed = participants.slice(0, phaseInfo.size);
  const matchDay = knockoutMatchDay(competitionCode, phaseInfo.phase, baseDay);
  const pairs = [];
  for (let index = 0; index < needed.length / 2; index += 1) {
    const home = rankedPairing ? needed[index] : needed[index * 2];
    const away = rankedPairing ? needed[needed.length - 1 - index] : needed[index * 2 + 1];
    pairs.push([home, away]);
  }

  for (let index = 0; index < pairs.length; index += 1) {
    const [home, away] = pairs[index];
    const twoLegged = phaseInfo.phase !== 'final';
    await run(`
      INSERT INTO european_matches
        (user_id, season, competition_code, phase, round_name, leg, match_day, match_date, home_team_id, away_team_id, home_european_team_id, away_european_team_id)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
    `, [
      scopedUserId,
      SEASON,
      competitionCode,
      phaseInfo.phase,
      phaseInfo.roundName,
      matchDay,
      seasonDate(matchDay),
      home.teamId,
      away.teamId,
      home.europeanTeamId,
      away.europeanTeamId
    ]);
    if (twoLegged) {
      const secondLegDay = matchDay + KNOCKOUT_SECOND_LEG_GAP;
      await run(`
        INSERT INTO european_matches
          (user_id, season, competition_code, phase, round_name, leg, match_day, match_date, home_team_id, away_team_id, home_european_team_id, away_european_team_id)
        VALUES (?, ?, ?, ?, ?, 2, ?, ?, ?, ?, ?, ?)
      `, [
        scopedUserId,
        SEASON,
        competitionCode,
        phaseInfo.phase,
        phaseInfo.roundName,
        secondLegDay,
        seasonDate(secondLegDay),
        away.teamId,
        home.teamId,
        away.europeanTeamId,
        home.europeanTeamId
      ]);
    }
  }

  await run(`
    INSERT INTO european_draws (user_id, season, competition_code, phase, draw_data)
    VALUES (?, ?, ?, ?, ?)
  `, [scopedUserId, SEASON, competitionCode, phaseInfo.phase, JSON.stringify({ roundName: phaseInfo.roundName, participants: pairs })]);
  console.log('EUROPE KNOCKOUT CHECK', {
    competitionCode,
    createdPhase: phaseInfo.phase,
    roundName: phaseInfo.roundName,
    matchDay,
    matchCount: pairs.length
  });
  return true;
}

async function maybeCreateEuropeanKnockouts(userId, competitionCode, fallbackDay = 0) {
  const scopedUserId = activeUserId(userId);
  const leagueMatches = await get(`
    SELECT COUNT(*) AS total, SUM(CASE WHEN played = 0 THEN 1 ELSE 0 END) AS unplayed, MAX(match_day) AS lastDay
    FROM european_matches
    WHERE user_id = ? AND season = ? AND competition_code = ? AND phase = 'league'
  `, [scopedUserId, SEASON, competitionCode]);
  if (!leagueMatches?.total || Number(leagueMatches.unplayed || 0) > 0) return false;

  const firstPhase = KNOCKOUT_SEQUENCE[0];
  if (!(await knockoutPhaseCount(scopedUserId, competitionCode, firstPhase.phase))) {
    const standings = await europeanStandings(scopedUserId, competitionCode);
    const participants = standings.slice(0, firstPhase.size).map(participantFromStanding);
    return createKnockoutRound(
      scopedUserId,
      competitionCode,
      firstPhase,
      participants,
      Math.max(Number(leagueMatches.lastDay || 0) + 7, Number(fallbackDay || 0) + 7),
      true
    );
  }

  for (let index = 0; index < KNOCKOUT_SEQUENCE.length; index += 1) {
    const phaseInfo = KNOCKOUT_SEQUENCE[index];
    const nextPhase = KNOCKOUT_SEQUENCE[index + 1];
    if (!nextPhase) continue;
    const currentMatches = await all(`
      SELECT *
      FROM european_matches
      WHERE user_id = ? AND season = ? AND competition_code = ? AND phase = ?
      ORDER BY id ASC
    `, [scopedUserId, SEASON, competitionCode, phaseInfo.phase]);
    if (!currentMatches.length || currentMatches.some((match) => !match.played)) continue;
    if (await knockoutPhaseCount(scopedUserId, competitionCode, nextPhase.phase)) continue;
    const decisiveMatches = phaseInfo.phase === 'final'
      ? currentMatches
      : currentMatches.filter((match) => Number(match.leg || 1) === 2);
    const winners = decisiveMatches.map(knockoutWinner);
    const lastDay = Math.max(...currentMatches.map((match) => Number(match.match_day || 0)));
    return createKnockoutRound(scopedUserId, competitionCode, nextPhase, winners, Math.max(lastDay + 7, Number(fallbackDay || 0) + 7), false);
  }

  return false;
}

async function maybeCreateEuropeanKnockoutsForAll(userId = null) {
  for (const code of ['UCL', 'UEL', 'UECL']) {
    await maybeCreateEuropeanKnockouts(userId, code);
  }
}

async function europeanRatings(home, away) {
  const local = home.source === 'local' ? home : away.source === 'local' ? away : null;
  if (!local) return [];
  const players = await all('SELECT id AS player_id, name, position, overall FROM players WHERE team_id = ? ORDER BY overall DESC LIMIT 11', [local.id]);
  return players.map((player, index) => ({
    ...player,
    team_id: local.id,
    rating: Number((7.6 - index * 0.12 + Math.random() * 0.8).toFixed(1)),
    goals: 0,
    assists: 0
  }));
}

async function updateEuropeanStandings(match, homeScore, awayScore) {
  const homeWin = homeScore > awayScore;
  const draw = homeScore === awayScore;
  const awayWin = awayScore > homeScore;
  await ensureStanding({ userId: match.user_id, competitionCode: match.competition_code, teamId: match.home_team_id, europeanTeamId: match.home_european_team_id });
  await ensureStanding({ userId: match.user_id, competitionCode: match.competition_code, teamId: match.away_team_id, europeanTeamId: match.away_european_team_id });
  await run(`
    UPDATE european_standings SET played = played + 1, wins = wins + ?, draws = draws + ?, losses = losses + ?,
      goals_for = goals_for + ?, goals_against = goals_against + ?, points = points + ?
    WHERE user_id = ? AND season = ? AND competition_code = ? AND COALESCE(team_id, 0) = COALESCE(?, 0) AND COALESCE(european_team_id, 0) = COALESCE(?, 0)
  `, [homeWin ? 1 : 0, draw ? 1 : 0, awayWin ? 1 : 0, homeScore, awayScore, homeWin ? 3 : draw ? 1 : 0, activeUserId(match.user_id), SEASON, match.competition_code, match.home_team_id, match.home_european_team_id]);
  await run(`
    UPDATE european_standings SET played = played + 1, wins = wins + ?, draws = draws + ?, losses = losses + ?,
      goals_for = goals_for + ?, goals_against = goals_against + ?, points = points + ?
    WHERE user_id = ? AND season = ? AND competition_code = ? AND COALESCE(team_id, 0) = COALESCE(?, 0) AND COALESCE(european_team_id, 0) = COALESCE(?, 0)
  `, [awayWin ? 1 : 0, draw ? 1 : 0, homeWin ? 1 : 0, awayScore, homeScore, awayWin ? 3 : draw ? 1 : 0, activeUserId(match.user_id), SEASON, match.competition_code, match.away_team_id, match.away_european_team_id]);
}

async function rebuildEuropeanStandings(userId = null, competitionCode = null) {
  const scopedUserId = activeUserId(userId);
  const codes = competitionCode ? [competitionCode] : ['UCL', 'UEL', 'UECL'];
  for (const code of codes) {
    await run(`
      UPDATE european_standings
      SET played = 0, wins = 0, draws = 0, losses = 0, goals_for = 0, goals_against = 0, points = 0
      WHERE user_id = ? AND season = ? AND competition_code = ?
    `, [scopedUserId, SEASON, code]);
    const playedMatches = await all(`
      SELECT *
      FROM european_matches
      WHERE user_id = ? AND season = ? AND competition_code = ? AND played = 1
      ORDER BY match_day ASC, id ASC
    `, [scopedUserId, SEASON, code]);
    for (const match of playedMatches) {
      await updateEuropeanStandings(match, match.home_score, match.away_score);
    }
  }
}

async function applyEuropeanRewards(match, home, away, homeScore, awayScore) {
  for (const side of [{ team: home, gf: homeScore, ga: awayScore }, { team: away, gf: awayScore, ga: homeScore }]) {
    if (side.team.source !== 'local') continue;
    const resultType = getResultType(side.gf, side.ga);
    const amount = resultType === 'win' ? PRIZE[match.competition_code].win : resultType === 'draw' ? PRIZE[match.competition_code].draw : 0;
    const club = match.user_id
      ? await get('SELECT * FROM clubs WHERE user_id = ? AND team_id = ?', [match.user_id, side.team.id])
      : await get('SELECT * FROM clubs WHERE team_id = ?', [side.team.id]);
    if (club && amount) await run('UPDATE clubs SET budget = budget + ?, fans = fans + ? WHERE id = ?', [amount, resultType === 'win' ? 900 : 250, club.id]);
    await run(`
      INSERT INTO european_awards (user_id, season, competition_code, team_id, award_type, amount, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [activeUserId(match.user_id), SEASON, match.competition_code, side.team.id, resultType, amount, `${side.team.name} Avrupa maç primi kazandı.`]);
  }
}

async function createEuropeanStories(match, home, away, homeScore, awayScore) {
  const comp = await competition(match.competition_code);
  const state = await careerState(match.user_id);
  for (const side of [{ team: home, opponent: away, gf: homeScore, ga: awayScore }, { team: away, opponent: home, gf: awayScore, ga: homeScore }]) {
    if (side.team.source !== 'local') continue;
    const resultType = getResultType(side.gf, side.ga);
    const data = {
      team: side.team.name,
      opponent: side.opponent.name,
      competition: comp.short_name,
      score: `${home.name} ${homeScore}-${awayScore} ${away.name}`
    };
    const socialPool = EURO_SOCIAL_TEMPLATES.filter((item) => item.requiredResult === resultType);
    const newsPool = EURO_NEWS_TEMPLATES.filter((item) => item.requiredResult === resultType);
    const social = pick(socialPool, state.current_day + match.id);
    let socialText = render(social.text, data);
    if (!validateNewsText(socialText, resultType)) socialText = resultType === 'draw' ? `${side.team.name} Avrupa'da 1 puan aldı.` : `${side.team.name} Avrupa'da puan alamadı.`;
    const news = pick(newsPool, state.current_day + match.id);
    let title = render(news.title, data);
    let summary = render(news.summary, data);
    if (!validateNewsText(`${title} ${summary}`, resultType)) {
      title = resultType === 'draw' ? `${side.team.name} Avrupa'da Berabere Kaldı` : `${side.team.name} Avrupa'da Puan Alamadı`;
      summary = resultType === 'draw' ? `${data.score} sonrası haneye 1 puan yazıldı.` : `${data.score} sonrası teknik ekipten reaksiyon bekleniyor.`;
    }
    await run(`
      INSERT INTO social_posts (day, type, author, content, template_key, category, team_id, match_id)
      VALUES (?, 'social', 'Avrupa Tribünü', ?, ?, ?, ?, ?)
    `, [state.current_day, socialText, `europe_social_${resultType}`, `europe_${resultType}`, side.team.id, match.id]);
    await run(`
      INSERT INTO news_feed (day, category, title, summary, template_key, team_id, match_id)
      VALUES (?, 'europe', ?, ?, ?, ?, ?)
    `, [state.current_day, title, summary, news.key, side.team.id, match.id]);
    console.log('EUROPE NEWS CHECK', { goalsFor: side.gf, goalsAgainst: side.ga, resultType, selectedNews: summary, validateNewsText: validateNewsText(`${title} ${summary}`, resultType) });
  }
}

async function nextEuropeanMatch(userIdOrTeamId, maybeTeamId = null) {
  const scopedUserId = maybeTeamId === null ? null : activeUserId(userIdOrTeamId);
  const teamId = maybeTeamId === null ? userIdOrTeamId : maybeTeamId;
  await ensureEuropeanSeason(scopedUserId, teamId);
  await maybeCreateEuropeanKnockoutsForAll(scopedUserId);
  return get(`
    SELECT em.*, ec.name AS competition_name, ec.short_name, ec.theme,
      ht.name AS home_name, at.name AS away_name, het.name AS home_european_name, aet.name AS away_european_name
    FROM european_matches em
    JOIN european_competitions ec ON ec.code = em.competition_code
    LEFT JOIN teams ht ON ht.id = em.home_team_id
    LEFT JOIN teams at ON at.id = em.away_team_id
    LEFT JOIN european_teams het ON het.id = em.home_european_team_id
    LEFT JOIN european_teams aet ON aet.id = em.away_european_team_id
    WHERE em.user_id = ? AND em.played = 0 AND (em.home_team_id = ? OR em.away_team_id = ?)
    ORDER BY em.match_day ASC, em.id ASC LIMIT 1
  `, [scopedUserId, teamId, teamId]);
}

async function dueEuropeanMatch(userIdOrTeamId, maybeTeamId, maybeDay = null) {
  const scopedUserId = maybeDay === null ? null : activeUserId(userIdOrTeamId);
  const teamId = maybeDay === null ? userIdOrTeamId : maybeTeamId;
  const day = maybeDay === null ? maybeTeamId : maybeDay;
  await ensureEuropeanSeason(scopedUserId, teamId);
  await maybeCreateEuropeanKnockoutsForAll(scopedUserId);
  return get(`
    SELECT * FROM european_matches
    WHERE user_id = ? AND played = 0 AND match_day <= ? AND (home_team_id = ? OR away_team_id = ?)
    ORDER BY match_day ASC, id ASC LIMIT 1
  `, [scopedUserId, day, teamId, teamId]);
}

async function knockoutRoundRows(userId, competitionCode, phase) {
  const rows = await all(`
    SELECT em.*, COALESCE(ht.name, het.name) AS home_name, COALESCE(at.name, aet.name) AS away_name
    FROM european_matches em
    LEFT JOIN teams ht ON ht.id = em.home_team_id
    LEFT JOIN teams at ON at.id = em.away_team_id
    LEFT JOIN european_teams het ON het.id = em.home_european_team_id
    LEFT JOIN european_teams aet ON aet.id = em.away_european_team_id
    WHERE em.user_id = ? AND em.season = ? AND em.competition_code = ? AND em.phase = ?
    ORDER BY em.match_day ASC, em.id ASC
  `, [activeUserId(userId), SEASON, competitionCode, phase]);
  return rows.map((row) => ({
    id: row.id,
    round_name: row.round_name,
    leg: row.leg,
    home_name: row.home_name,
    away_name: row.away_name,
    home_score: row.home_score,
    away_score: row.away_score,
    aggregate_home: row.aggregate_home,
    aggregate_away: row.aggregate_away,
    penalties_home: row.penalties_home,
    penalties_away: row.penalties_away,
    played: Boolean(row.played),
    match_date: row.match_date,
    match_day: row.match_day
  }));
}

async function playDueEuropeanMatch(userIdOrTeamId, maybeTeamId, maybeDay = null) {
  const scopedUserId = maybeDay === null ? null : activeUserId(userIdOrTeamId);
  const teamId = maybeDay === null ? userIdOrTeamId : maybeTeamId;
  const day = maybeDay === null ? maybeTeamId : maybeDay;
  await repairEuropeanDuplicateFixtures(scopedUserId);
  const due = await dueEuropeanMatch(scopedUserId, teamId, day);
  if (!due) return null;
  const sameSlot = await all('SELECT * FROM european_matches WHERE user_id = ? AND played = 0 AND competition_code = ? AND match_day = ? ORDER BY id ASC', [scopedUserId, due.competition_code, due.match_day]);
  const results = [];
  let featured = null;
  const userMatch = sameSlot.find((match) => match.home_team_id === teamId || match.away_team_id === teamId) || due;
  if (userMatch) {
    featured = await simulateEuropeanMatch(userMatch);
    results.push(featured);
  }
  for (const match of sameSlot) {
    if (userMatch && match.id === userMatch.id) continue;
    const result = await simulateEuropeanBotMatch(match);
    results.push(result);
  }
  await maybeCreateEuropeanKnockouts(scopedUserId, due.competition_code, due.match_day);
  const state = await careerState(scopedUserId);
  if (state?.next_match_day >= due.match_day && state.next_match_day - due.match_day < 2) {
    const shiftedDay = due.match_day + 3;
    if (scopedUserId) {
      await run('UPDATE career_states SET next_match_day = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?', [shiftedDay, scopedUserId]);
    } else {
      await run('UPDATE game_state SET next_match_day = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1', [shiftedDay]);
    }
    console.log('CALENDAR CHECK', {
      conflictResolved: true,
      europeanDay: due.match_day,
      shiftedSuperLigDay: shiftedDay
    });
  }
  const isKnockout = !['league', 'qualifying'].includes(due.phase);
  const table = isKnockout ? [] : await europeanStandings(scopedUserId, due.competition_code);
  const knockoutRound = isKnockout ? await knockoutRoundRows(scopedUserId, due.competition_code, due.phase) : null;
  const competitionType = COMPETITION_TYPE_BY_CODE[due.competition_code];
  const comp = await competition(due.competition_code);
  return {
    european: true,
    knockout: isKnockout,
    competitionType,
    standingsCompetition: competitionType,
    shownStandingsCompetition: competitionType,
    standingsTitle: isKnockout ? `${comp?.short_name || 'Avrupa'} ${due.round_name}` : `${comp?.short_name || 'Avrupa'} puan durumu`,
    tableCompetitionCode: due.competition_code,
    knockoutRound,
    featured,
    results,
    table,
    userTeamId: teamId
  };
}

async function europeanStandings(userIdOrCode, maybeCode = null) {
  const scopedUserId = maybeCode === null ? null : activeUserId(userIdOrCode);
  const code = maybeCode === null ? userIdOrCode : maybeCode;
  return all(`
    SELECT es.*, COALESCE(t.name, et.name) AS name, COALESCE(t.logo_url, et.logo_url) AS logo_url,
      (es.goals_for - es.goals_against) AS goal_difference
    FROM european_standings es
    LEFT JOIN teams t ON t.id = es.team_id
    LEFT JOIN european_teams et ON et.id = es.european_team_id
    WHERE es.user_id = ? AND es.season = ? AND es.competition_code = ?
    ORDER BY es.points DESC, goal_difference DESC, es.goals_for DESC, name ASC
  `, [scopedUserId, SEASON, code]);
}

async function europeanOverview(userIdOrTeamId = null, maybeTeamId = null) {
  const scopedUserId = maybeTeamId === null ? null : activeUserId(userIdOrTeamId);
  const userTeamId = maybeTeamId === null ? userIdOrTeamId : maybeTeamId;
  const state = await careerState(scopedUserId);
  const next = userTeamId ? await nextEuropeanMatch(scopedUserId, userTeamId) : null;
  const phaseDraw = next ? await get(`
    SELECT CASE WHEN MIN(match_day) - 7 < 1 THEN 1 ELSE MIN(match_day) - 7 END AS draw_day
    FROM european_matches
    WHERE user_id = ? AND season = ? AND competition_code = ? AND phase = ? AND round_name = ?
      AND (home_team_id = ? OR away_team_id = ?)
  `, [scopedUserId, SEASON, next.competition_code, next.phase, next.round_name, userTeamId, userTeamId]) : null;
  const drawDay = next ? Number(phaseDraw?.draw_day || Math.max(1, Number(next.match_day || 1) - 7)) : null;
  const drawRevealed = !next || Number(state.current_day || 1) >= drawDay;
  const safeNext = next && !drawRevealed
    ? {
        ...next,
        home_name: 'Kura bekleniyor',
        away_name: 'Kura bekleniyor',
        home_european_name: 'Kura bekleniyor',
        away_european_name: 'Kura bekleniyor',
        draw_day: drawDay,
        draw_revealed: false
      }
    : next ? { ...next, draw_day: drawDay, draw_revealed: true } : null;
  const entries = await all(`
    SELECT ee.*, ec.name AS competition_name, ec.short_name, t.name AS team_name, et.name AS european_team_name
    FROM european_entries ee
    JOIN european_competitions ec ON ec.code = ee.competition_code
    LEFT JOIN teams t ON t.id = ee.team_id
    LEFT JOIN european_teams et ON et.id = ee.european_team_id
    WHERE ee.user_id = ? AND ee.season = ?
    ORDER BY ee.competition_code, ee.id
  `, [scopedUserId, SEASON]);
  const draws = await all("SELECT * FROM european_draws WHERE user_id = ? AND competition_code != 'CONFIG' ORDER BY id DESC LIMIT 12", [scopedUserId]);
  return {
    season: SEASON,
    state,
    next: safeNext,
    matchAvailable: next ? state.current_day >= next.match_day : false,
    entries,
    draws,
    competitions: await all('SELECT * FROM european_competitions ORDER BY id ASC'),
    rules: await qualificationRules()
  };
}

module.exports = {
  ensureEuropeanSeason,
  nextEuropeanMatch,
  dueEuropeanMatch,
  playDueEuropeanMatch,
  europeanOverview,
  europeanStandings,
  createSquadSnapshot,
  restoreLastSquadSnapshot,
  rebuildEuropeanStandings,
  maybeCreateEuropeanKnockoutsForAll,
  getResultType,
  validateNewsText,
  EURO_SOCIAL_TEMPLATES,
  EURO_NEWS_TEMPLATES
};
