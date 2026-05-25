# Basit Futbol Menajerlik Oyunu

Tarayicida calisan, Express + SQLite destekli basit futbol menajerlik oyunu.
Kullanici kaydolur, kulup sahibi olur, kadro ve taktik belirler, transfer yapar, antrenman uygular ve mac simule eder.

## Proje Plani

1. Backend: Node.js, Express, oturum bazli auth, SQLite semasi, Super Lig takim ve oyuncu seed verisi.
2. Oyun mantigi: ilk 11 gucu, moral, kondisyon, taktik bonuslari ve kontrollu rastgelelik ile mac sonucu.
3. Frontend: HTML, CSS ve vanilla JavaScript ile responsive sayfalar.
4. Guvenlik: bcrypt sifre hashleme, session cookie, endpoint bazli yetki kontrolu, basit input validation.
5. Ekonomi: mac odulu, bilet geliri, sponsor geliri, maas gideri ve transfer butce etkisi.

## Super Lig 2025-2026 Veri Katmani

Takim listesi `frontend/data/superlig-teams-2026.json` dosyasindadir.
Oyuncu listesi `frontend/data/superlig-players-2026.json` dosyasindadir.

Kaynak dogrulama:

- TFF 2025-2026 Super Lig statüsünde ligin 18 takimdan olustugu belirtilir.
- TFF 2025-2026 fikstur ve puan cetveli kullanicinin verdigi 18 takim listesini dogrular.

Logo sistemi:

- `logo_url` alanlari `/frontend/assets/logos` altindaki dosyalari destekler.
- Resmi logo dosyasi eklenene kadar `placeholder.svg` kullanilir.

Yeni backend parcalari:

- `backend/seed/superligSeed.js`
- `backend/utils/overallCalculator.js`
- `backend/utils/matchEngine.js`
- `backend/utils/trainingEngine.js`
- `backend/utils/lineupValidator.js`

Yeni frontend parcalari:

- `frontend/lineup.html`
- `frontend/team-detail.html`
- `frontend/js/lineup.js`
- `frontend/js/team-detail.js`

## Kurulum

```bash
cd project/backend
npm install
npm start
```

Tarayicida ac:

```text
http://localhost:3000
```

PowerShell npm betik kisiti verirse:

```powershell
npm.cmd install
npm.cmd start
```

## Demo Akisi

1. `register.html` sayfasindan hesap ve takim olustur.
2. Dashboard uzerinden butce, lig sirasi ve takim gucunu kontrol et.
3. Kadro sayfasinda ilk 11 sec.
4. Taktik sayfasinda formasyon ve oyun tarzi belirle.
5. Mac sayfasinda mac simule et.
6. Lig, transfer, antrenman ve ekonomi sayfalarindan kulubu yonet.

## API Ozeti

- `POST /api/register`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`
- `GET /api/club`
- `PUT /api/club`
- `GET /api/players`
- `PUT /api/players/:id`
- `POST /api/lineup`
- `GET /api/tactics`
- `POST /api/tactics`
- `POST /api/match/play`
- `GET /api/matches`
- `GET /api/match/:id`
- `GET /api/league/table`
- `GET /api/transfers/market`
- `POST /api/transfers/buy`
- `POST /api/transfers/sell`
- `POST /api/training`
- `GET /api/training/history`

## Veritabani

Uygulama ilk acilista `backend/football_manager.sqlite` dosyasini olusturur.
Sema ve seed verileri `backend/database.js` icinde otomatik kurulur.

Seed icerigi:

- 18 Super Lig takimi
- Her takim icin baslangic ilk 11 oyunculari
- Transfer pazari oyunculari
- Yeni kayit olan kullanici icin secilen Super Lig takimi ve varsayilan taktik

## Notlar

- Bu proje lokal prototiptir. Canli ortama cikmadan once `SESSION_SECRET` ortam degiskeni ayarlanmalidir.
- `npm audit fix` kirici olmayan duzeltmeleri uygulayamazsa, kalan uyarilar SQLite surucusunun ana surum gecisine bagli olabilir.
