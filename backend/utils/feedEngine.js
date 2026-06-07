const { all, get, run, getCareerState } = require('../database');

const fanAuthors = [
  'Taraftar Tribünü', 'TactiCore Gündem', 'Futbolun Sesi', 'Pres Analiz', 'Kale Arkası',
  'Spor Muhabiri', 'Maç Günü', 'Futbol Mizah', 'Taktik Defteri', 'Transfer Nöbeti'
];

const socialAngles = [
  ['win', '3 puan güzel geldi, takımın yüzü güldü 🔥 #MaçGünü'],
  ['loss', 'Bu maçtan sonra soyunma odasında ciddi konuşma şart.'],
  ['draw', 'Bir puan cepte ama oyun hâlâ soru işareti.'],
  ['tactic', 'Hocanın taktik tercihi bugün maçın hikayesini yazdı.'],
  ['transfer', 'Transfer dönemi yaklaşırken kulüpte hareketlilik var.'],
  ['young_star', 'Genç oyuncu bugün sahaya karakter koydu 👏'],
  ['injury', 'Sakatlık haberi moral bozdu, rotasyon daralıyor.'],
  ['referee', 'Hakem kararları yine gündemin tam ortasında.'],
  ['derby', 'Derbide böyle oynanmaz hocam...'],
  ['bad_form', 'Kötü seri taraftarın sabrını zorluyor.'],
  ['title_race', 'Şampiyonluk yarışı böyle haftalarda şekillenir.'],
  ['relegation', 'Alt sıralarda nefesler tutuldu, her puan altın değerinde.'],
  ['press', 'Bu pres oyunu taraftarı mest etti 🔥 #Pres'],
  ['defense', 'Bu savunma çizgisiyle her maç sıkıntı yaşanır.'],
  ['attack', 'Bu takımın acilen bitirici forvete ihtiyacı var.']
];

const tones = [
  'Net yorum:', 'Sıcak take:', 'Tribünden ses:', 'Analiz:', 'Hater modu:', 'Pozitif bakış:',
  'Tarafsız yorum:', 'Soyunma odası kokusu:', 'Maç sonu:', 'Gündem:'
];

const endings = [
  '#TactiCore', '#SüperLig', '#Transfer', '#MaçGünü', '#Taktik', '#Tribün',
  'Bunu konuşalım.', 'Katılan var mı?', 'Bu işin sonu hareketli.', 'Gözler yönetimde.'
];

const newsCategories = [
  'match_preview', 'match_report', 'transfer', 'tactic', 'player', 'young_star', 'fan_pressure',
  'board', 'injury', 'derby', 'title_race', 'crisis', 'morale', 'club'
];

const headlineBases = [
  'Kulüpte Transfer Hareketliliği Başladı',
  'Taraftar Yeni Forvet Bekliyor',
  'Teknik Direktörün Taktik Tercihi Gündem Oldu',
  'Genç Oyuncu Performansıyla Dikkat Çekti',
  'Derbi Öncesi Nefesler Tutuldu',
  'Yönetimden Transfer Bütçesi Hamlesi',
  'Kötü Seri Sonrası Soyunma Odasında Alarm',
  'Yeni Sistem Sahada Karşılık Buldu',
  'Scout Ekibinden Sürpriz Öneri',
  'Takımda Moral Rüzgarı',
  'Savunma Çizgisi Tartışma Yarattı',
  'Pres Planı Maçın Kilidini Açtı',
  'Yıldız Oyuncuya Yoğun İlgi',
  'Kiralık Hamle Masada',
  'Sözleşmesi Biten Oyuncular Gündemde',
  'Ucuz Fırsat Transferi İçin Temas',
  'Taraftar Sosyal Medyada İkiye Bölündü',
  'Başkan Bütçe Planını Güncelledi',
  'Haftanın En Çok Konuşulan Takımı',
  'Avrupa Hedefi Transfer Planını Değiştirdi'
];

function buildSocialTemplates() {
  const templates = [];
  for (const [category, text] of socialAngles) {
    for (const tone of tones) {
      for (const ending of endings) {
        templates.push({
          key: `social_${category}_${templates.length}`,
          category,
          type: 'social',
          author: fanAuthors[templates.length % fanAuthors.length],
          content: `${tone} {team} için ${text} ${ending}`
        });
      }
    }
  }
  return templates.slice(0, 180);
}

function buildNewsTemplates() {
  const templates = [];
  for (const category of newsCategories) {
    for (const headline of headlineBases) {
      templates.push({
        key: `news_${category}_${templates.length}`,
        category,
        type: 'newspaper',
        title: headline,
        summary: '{team} cephesinde hafta hareketli geçiyor. {player} ve teknik heyetin kararları gündemde. Form durumu {form}, lig sırası {rank}. Transfer başlığı: {transfer}.'
      });
    }
  }
  return templates.slice(0, 140);
}

const SOCIAL_TEMPLATES = buildSocialTemplates();
const NEWS_TEMPLATES = buildNewsTemplates();

const MATCH_SOCIAL_TEMPLATES = [
  { key: 'match_social_win_1', requiredResult: 'win', text: '{team} için 3 puan geldi, taraftarın beklediği reaksiyon buydu 🔥 #MaçGünü' },
  { key: 'match_social_win_2', requiredResult: 'win', text: '{team} kritik galibiyetle moral buldu. {player} bugün fark yarattı.' },
  { key: 'match_social_win_3', requiredResult: 'win', text: 'Bu zafer soyunma odasına ilaç gibi gelir. Skor: {score}' },
  { key: 'match_social_win_4', requiredResult: 'win', text: 'Taraftar kutlamaya başladı, {team} sahadan istediğini aldı.' },
  { key: 'match_social_draw_1', requiredResult: 'draw', text: '{team} sahadan 1 puanla ayrıldı. Oyun dengedeydi ama kaçan fırsatlar konuşulur.' },
  { key: 'match_social_draw_2', requiredResult: 'draw', text: 'Beraberlik sonrası yorum net: 1 puan var ama geliştirilmesi gereken çok şey var.' },
  { key: 'match_social_draw_3', requiredResult: 'draw', text: '{score} sonrası taraftar ikiye bölündü. Denge vardı, bitiricilik eksikti.' },
  { key: 'match_social_draw_4', requiredResult: 'draw', text: '{team} puan aldı ama üstünlüğü getirecek son dokunuş gelmedi.' },
  { key: 'match_social_loss_1', requiredResult: 'loss', text: '{team} sahadan mağlubiyetle ayrıldı. Taraftar özellikle savunma kararlarına tepkili.' },
  { key: 'match_social_loss_2', requiredResult: 'loss', text: 'Yenilgi sonrası eleştiriler artacak. {team} için toparlanma haftası şart.' },
  { key: 'match_social_loss_3', requiredResult: 'loss', text: '{score} sonrası puan kaybı ağır geldi. Teknik ekibin çözüm bulması gerekiyor.' },
  { key: 'match_social_loss_4', requiredResult: 'loss', text: '{team} maç sonunda üzgün. Oyun planı tartışılır, tepki normal.' }
];

const MATCH_NEWS_TEMPLATES = [
  {
    key: 'match_news_win_1',
    requiredResult: 'win',
    title: '{team} Kritik Galibiyetle Nefes Aldı',
    text: '{score} sonucuyla gelen galibiyet kulüpte moralleri yükseltti. {player} performansıyla maçın öne çıkan ismi oldu.'
  },
  {
    key: 'match_news_win_2',
    requiredResult: 'win',
    title: '3 Puanın Mimarı Taktik Plan Oldu',
    text: '{team}, maç boyunca planına sadık kaldı ve sahadan değerli bir zaferle ayrıldı. Taraftar sonuçtan memnun.'
  },
  {
    key: 'match_news_draw_1',
    requiredResult: 'draw',
    title: '{team} Sahadan 1 Puanla Ayrıldı',
    text: '{score} sonrası kulüpte karışık duygular var. Oyun dengede geçti, ancak son bölümde skoru değiştirecek hamle gelmedi.'
  },
  {
    key: 'match_news_draw_2',
    requiredResult: 'draw',
    title: 'Beraberlik Sonrası Taktik Tartışması',
    text: '{team} için 1 puan yeterli görülmedi. Taraftar, özellikle hücumdaki son tercihleri konuşuyor.'
  },
  {
    key: 'match_news_loss_1',
    requiredResult: 'loss',
    title: '{team} Mağlubiyet Sonrası Baskı Altında',
    text: '{score} sonucunun ardından kulüpte eleştiriler yükseldi. Teknik ekipten hızlı reaksiyon bekleniyor.'
  },
  {
    key: 'match_news_loss_2',
    requiredResult: 'loss',
    title: 'Yenilgi Sonrası Soyunma Odasında Alarm',
    text: '{team} puan kaybıyla haftayı kapattı. Taraftar savunma hataları ve maç içi kararlar konusunda tepkili.'
  }
];

const WIN_ONLY_WORDS = ['3 puan', 'galibiyet', 'zafer', 'kazandı', 'kazandı', 'kutladı', 'kutladı', 'kutlama', '3 puanın sahibi', '3 puanın sahibi'];

for (const template of [...MATCH_SOCIAL_TEMPLATES, ...MATCH_NEWS_TEMPLATES]) {
  template.forbiddenWords = template.requiredResult === 'win' ? [] : WIN_ONLY_WORDS;
}

function getResultType(userGoals, opponentGoals) {
  if (userGoals > opponentGoals) return 'win';
  if (userGoals < opponentGoals) return 'loss';
  return 'draw';
}

function getPointsByResult(resultType) {
  if (resultType === 'win') return 3;
  if (resultType === 'draw') return 1;
  return 0;
}

function validateNewsText(text, resultType, forbiddenWords = []) {
  const lowered = String(text || '').toLowerCase();
  const blocked = resultType === 'win' ? forbiddenWords : [...WIN_ONLY_WORDS, ...forbiddenWords];
  return !blocked.some((word) => lowered.includes(String(word).toLowerCase()));
}

function fallbackMatchTemplate(resultType, feedType) {
  if (resultType === 'win') {
    return {
      key: `${feedType}_fallback_win`,
      requiredResult: 'win',
      forbiddenWords: [],
      title: '{team} Sahadan Galibiyetle Ayrıldı',
      text: '{team}, sahadan galibiyetle ayr?ld?.'
    };
  }
  if (resultType === 'draw') {
    return {
      key: `${feedType}_fallback_draw`,
      requiredResult: 'draw',
      forbiddenWords: WIN_ONLY_WORDS,
      title: '{team} Sahadan Beraberlikle Ayrıldı',
      text: '{team}, sahadan beraberlikle ayr?ld? ve hanesine 1 puan yazd?rd?.'
    };
  }
  return {
    key: `${feedType}_fallback_loss`,
    requiredResult: 'loss',
    forbiddenWords: WIN_ONLY_WORDS,
    title: '{team} Sahadan Puansız Ayrıldı',
    text: '{team}, sahadan puans?z ayr?ld?.'
  };
}

function render(template, data = {}) {
  return String(template)
    .replaceAll('{team}', data.team || 'Takım')
    .replaceAll('{teamName}', data.team || 'Takım')
    .replaceAll('{player}', data.player || 'oyuncu')
    .replaceAll('{opponent}', data.opponent || 'rakip')
    .replaceAll('{score}', data.score || '-')
    .replaceAll('{rank}', data.rank || '-')
    .replaceAll('{form}', data.form || 'belirsiz')
    .replaceAll('{transfer}', data.transfer || 'kulüp fırsat kolluyor');
}

async function currentState(userId = null) {
  return userId ? getCareerState(userId) : get('SELECT * FROM game_state WHERE id = 1');
}

async function teamContext(teamId, userId = null) {
  const [team, rankRows, bestPlayer, latestTransfer] = await Promise.all([
    get('SELECT * FROM teams WHERE id = ?', [teamId]),
    userId ? all(`
      SELECT t.id, t.name, COALESCE(ls.points, 0) AS points, COALESCE(ls.form, '') AS form,
        ROW_NUMBER() OVER (ORDER BY COALESCE(ls.points, 0) DESC, (COALESCE(ls.goals_for, 0) - COALESCE(ls.goals_against, 0)) DESC, COALESCE(ls.goals_for, 0) DESC, t.name ASC) AS rank
      FROM teams t
      LEFT JOIN league_standings ls ON ls.team_id = t.id AND ls.user_id = ?
    `, [userId]) : all(`
      SELECT id, name, points, form, ROW_NUMBER() OVER (ORDER BY points DESC, (goals_for - goals_against) DESC, goals_for DESC, name ASC) AS rank
      FROM teams
    `),
    get('SELECT * FROM players WHERE team_id = ? ORDER BY overall DESC, morale DESC LIMIT 1', [teamId]),
    get(`
      SELECT th.*, p.name AS player_name
      FROM transfer_history th
      JOIN players p ON p.id = th.player_id
      WHERE th.from_team_id = ? OR th.to_team_id = ?
      ORDER BY th.id DESC LIMIT 1
    `, [teamId, teamId])
  ]);
  const rank = rankRows.find((row) => row.id === teamId)?.rank || '-';
  return {
    team,
    player: bestPlayer,
    data: {
      team: team?.name || 'Takım',
      player: bestPlayer?.name || 'takımın yıldızı',
      rank,
      form: team?.form || 'yeni başlıyor',
      transfer: latestTransfer?.player_name ? `${latestTransfer.player_name} gündemde` : 'piyasa takip ediliyor'
    }
  };
}

async function pickUnused(templates, feedType, category, week, day) {
  const matched = templates.filter((item) => !category || item.category === category);
  const pool = matched.length ? matched : templates;
  const recent = await all(
    'SELECT template_key FROM used_templates WHERE feed_type = ? AND week >= ?',
    [feedType, Math.max(0, Number(week || 1) - 5)]
  );
  const used = new Set(recent.map((row) => row.template_key));
  const fresh = pool.filter((item) => !used.has(item.key));
  const source = fresh.length ? fresh : pool;
  const selected = source[(Number(day || 1) + source.length * 7 + Math.floor(Math.random() * source.length)) % source.length];
  await run('INSERT INTO used_templates (template_key, feed_type, week, day) VALUES (?, ?, ?, ?)', [
    selected.key, feedType, week || 1, day || 1
  ]);
  return selected;
}

async function pickMatchTemplate(templates, resultType, feedType, week, day, data = {}) {
  const validTemplates = templates
    .filter((template) => template.requiredResult === resultType)
    .filter((template) => {
      const renderedText = render([template.title, template.text].filter(Boolean).join(' '), data);
      return validateNewsText(renderedText, resultType, template.forbiddenWords || []);
    });
  const pool = validTemplates.length ? validTemplates : [fallbackMatchTemplate(resultType, feedType)];
  const recent = await all(
    'SELECT template_key FROM used_templates WHERE feed_type = ? AND week >= ?',
    [feedType, Math.max(0, Number(week || 1) - 5)]
  );
  const used = new Set(recent.map((row) => row.template_key));
  const fresh = pool.filter((item) => !used.has(item.key));
  const source = fresh.length ? fresh : pool;
  const selected = source[(Number(day || 1) + Math.floor(Math.random() * source.length)) % source.length];
  await run('INSERT INTO used_templates (template_key, feed_type, week, day) VALUES (?, ?, ?, ?)', [
    selected.key, feedType, week || 1, day || 1
  ]);
  return selected;
}

async function insertSocialPost({ day, week, teamId, playerId = null, matchId = null, category = 'social', data = {} }) {
  const template = await pickUnused(SOCIAL_TEMPLATES, 'social', category, week, day);
  const content = render(template.content, data);
  await run(`
    INSERT INTO social_posts (day, type, author, content, template_key, category, team_id, player_id, match_id)
    VALUES (?, 'social', ?, ?, ?, ?, ?, ?, ?)
  `, [day, template.author, content, template.key, category, teamId || null, playerId, matchId]);
  return content;
}

async function insertNews({ day, week, teamId, playerId = null, matchId = null, category = 'club', data = {} }) {
  const template = await pickUnused(NEWS_TEMPLATES, 'news', category, week, day);
  const title = render(template.title, data);
  const summary = render(template.summary, data);
  await run(`
    INSERT INTO news_feed (day, category, title, summary, template_key, team_id, player_id, match_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [day, category, title, summary, template.key, teamId || null, playerId, matchId]);
  return { title, summary };
}

async function ensureDailyFeed(teamId) {
  const state = await currentState();
  const existing = await get('SELECT COUNT(*) AS count FROM social_posts WHERE day = ? AND team_id = ?', [state.current_day, teamId]);
  if (existing.count > 0) return;
  const context = await teamContext(teamId);
  const categories = ['transfer', 'tactic', 'fan_pressure', 'club', 'press'];
  for (let i = 0; i < 5; i += 1) {
    await insertSocialPost({ day: state.current_day, week: state.week, teamId, category: categories[i % categories.length], data: context.data });
  }
  await insertNews({ day: state.current_day, week: state.week, teamId, category: 'club', data: context.data });
}

async function createTransferStory({ teamId, playerId, category = 'transfer', status = 'rumor', price = 0 }) {
  const state = await currentState();
  const context = await teamContext(teamId);
  const player = playerId ? await get('SELECT * FROM players WHERE id = ?', [playerId]) : context.player;
  const data = {
    ...context.data,
    player: player?.name || context.data.player,
    transfer: status === 'completed' ? `${player?.name || 'oyuncu'} imzaya yakın` : `${player?.name || 'oyuncu'} için temas var`
  };
  await insertSocialPost({ day: state.current_day, week: state.week, teamId, playerId, category: 'transfer', data });
  await insertNews({ day: state.current_day, week: state.week, teamId, playerId, category: category === 'loan' ? 'transfer' : 'transfer', data });
  return price;
}

async function createMatchStories(roundResult, userTeamId, userId = null) {
  const state = await currentState(userId);
  const featured = roundResult?.featured;
  if (!featured?.match) return;
  const numericUserTeamId = Number(userTeamId);
  const homeId = Number(featured.home?.team_id || featured.home?.id || featured.match.home_team_id || featured.match.home_club_id || 0);
  const awayId = Number(featured.away?.team_id || featured.away?.id || featured.match.away_team_id || featured.match.away_club_id || 0);
  const isHome = homeId === numericUserTeamId || (homeId !== numericUserTeamId && awayId !== numericUserTeamId);
  const focusTeam = isHome ? featured.home : featured.away;
  const opponent = isHome ? featured.away : featured.home;
  const userGoals = isHome ? featured.match.home_score : featured.match.away_score;
  const opponentGoals = isHome ? featured.match.away_score : featured.match.home_score;
  const resultType = getResultType(userGoals, opponentGoals);
  const points = getPointsByResult(resultType);
  const context = await teamContext(focusTeam.id, userId);
  const score = `${featured.home.name} ${featured.match.home_score}-${featured.match.away_score} ${featured.away.name}`;
  const best = featured.playerRatings?.[0];
  const data = {
    ...context.data,
    score,
    opponent: opponent.name,
    player: best?.name || context.data.player,
    transfer: featured.match.tactical_summary || context.data.transfer
  };
  const selectedSocial = await pickMatchTemplate(MATCH_SOCIAL_TEMPLATES, resultType, 'match_social', state.week, state.current_day, data);
  const selectedNews = await pickMatchTemplate(MATCH_NEWS_TEMPLATES, resultType, 'match_news', state.week, state.current_day, data);
  const socialContent = render(selectedSocial.text, data);
  const newsTitle = render(selectedNews.title, data);
  const newsSummary = render(selectedNews.text, data);
  const isSocialValid = validateNewsText(socialContent, resultType, selectedSocial.forbiddenWords || []);
  const isNewsValid = validateNewsText(`${newsTitle} ${newsSummary}`, resultType, selectedNews.forbiddenWords || []);

  console.log('MATCH NEWS CHECK', {
    userGoals,
    opponentGoals,
    resultType,
    points,
    selectedTemplate: selectedNews.text,
    requiredResult: selectedNews.requiredResult,
    selectedNews: newsSummary,
    validateNewsText: isSocialValid && isNewsValid
  });

  await run(`
    INSERT INTO social_posts (day, type, author, content, template_key, category, team_id, player_id, match_id)
    VALUES (?, 'social', ?, ?, ?, ?, ?, ?, ?)
  `, [
    state.current_day,
    fanAuthors[(state.current_day + focusTeam.id) % fanAuthors.length],
    isSocialValid ? socialContent : render(fallbackMatchTemplate(resultType, 'match_social').text, data),
    selectedSocial.key,
    resultType,
    focusTeam.id,
    best?.player_id || null,
    featured.match.id
  ]);

  await run(`
    INSERT INTO news_feed (day, category, title, summary, template_key, team_id, player_id, match_id)
    VALUES (?, 'match_report', ?, ?, ?, ?, ?, ?)
  `, [
    state.current_day,
    isNewsValid ? newsTitle : render(fallbackMatchTemplate(resultType, 'match_news').title, data),
    isNewsValid ? newsSummary : render(fallbackMatchTemplate(resultType, 'match_news').text, data),
    selectedNews.key,
    focusTeam.id,
    best?.player_id || null,
    featured.match.id
  ]);
}

async function combinedFeed({ day, filter = 'all', limit = 60 }) {
  const social = await all('SELECT id, day, type, author, content, category, created_at FROM social_posts WHERE day <= ? ORDER BY day DESC, id DESC LIMIT ?', [day, limit]);
  const news = await all('SELECT id, day, category, title, summary, created_at FROM news_feed WHERE day <= ? ORDER BY day DESC, id DESC LIMIT ?', [day, limit]);
  let rows = [
    ...social.map((item) => ({ ...item, feed_kind: 'social', title: item.author, body: item.content })),
    ...news.map((item) => ({ ...item, feed_kind: 'news', type: 'newspaper', author: 'TactiCore Gazete', body: item.summary }))
  ].sort((a, b) => b.day - a.day || String(b.created_at).localeCompare(String(a.created_at)));

  if (filter === 'transfer') rows = rows.filter((item) => item.category === 'transfer');
  if (filter === 'match') rows = rows.filter((item) => ['match_report', 'match_preview', 'win', 'loss', 'draw', 'tactic', 'derby'].includes(item.category));
  if (filter === 'social') rows = rows.filter((item) => item.feed_kind === 'social');
  if (filter === 'club') rows = rows.filter((item) => ['club', 'board', 'fan_pressure', 'morale', 'crisis'].includes(item.category));
  return rows.slice(0, limit);
}

module.exports = {
  SOCIAL_TEMPLATES,
  NEWS_TEMPLATES,
  ensureDailyFeed,
  createTransferStory,
  createMatchStories,
  combinedFeed,
  insertNews,
  insertSocialPost
};
