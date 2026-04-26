# Tax Wars 💰

Capital gains tax classroom simulation game.

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start

# 3. Open in browser
# Teacher:  http://localhost:3000/host.html
# Students: http://localhost:3000/player.html
```

That's it. No accounts, no config, no Firebase.

---

## How to run in the classroom

1. Start the server on the teacher's laptop (`npm start`)
2. Make sure all devices are on the **same WiFi network**
3. Students don't go to `localhost` — they go to the teacher's **local IP address**:
   - Find your IP: run `ipconfig` (Windows) or `ifconfig` (Mac) in terminal
   - Students open: `http://192.168.x.x:3000/player.html` (replace with your IP)
4. On `host.html`, click **Create New Game** → a QR code appears
5. Students scan the QR or type the game code

---

## File structure

```
taxwars/
├── server.js          ← Node.js backend (Express + Socket.io)
├── package.json
├── public/
│   ├── game-engine.js ← Shared constants (characters, assets, tax logic)
│   ├── host.html      ← Teacher dashboard (open on classroom projector)
│   └── player.html    ← Student mobile app (opened via QR code)
└── README.md
```

---

## Game flow

| Step | Who | What |
|------|-----|-------|
| Create game | Host | Generates 5-letter code + QR |
| Join | Students | Scan QR → auto-assigned a character |
| Start round | Host | Distributes income, opens investing phase |
| Invest | Students | Buy/sell assets on their phone |
| Reveal prices | Host | Server generates 10-year returns, updates all screens |
| Results | Everyone | Tax calculated, wealth updated, leaderboard shown |
| Repeat | — | 3 rounds total (30 years) |

---

## The 6 characters

| Character | Income/round | Tax |
|-----------|-------------|-----|
| 🧍 Fernand — Factory Worker | €9,600 | 10% (usually exempt) |
| 👩‍💼 Sofie — HR Manager | €24,000 | 10% |
| 👩‍🦱 Vanessa — Senior Consultant | €60,000 | 10% |
| 🏭 Bart — Concrete Plant Owner | €720,000 | 10% |
| 🎩 Willy — Private Equity | €360,000,000 | **0%** (holding company) |
| 📈 Marie-Jeanne — Stock Investor | €360,000,000 | 10% |

Willy and Marie-Jeanne have identical wealth and returns. The only difference is tax structure.

---

## Assets available

**Stocks:** Alphabet, Nvidia, IonQ, Duolingo, Berkshire Hathaway, Shell, BNP Paribas  
**Bonds:** Belgium, Germany, US Treasury  
**ETFs:** S&P 500, Nasdaq 100, MSCI World

Prices are randomly simulated using realistic parameters (expected returns + volatility).  
Bonds are stable, stocks are volatile, IonQ is very volatile. Some will crash — that's intentional.

---

## Tax rules (Belgium 2025)

- **Rate:** 10% on realised capital gains
- **Exemption:** €6,000/year → €60,000 per round (10 years)
- **Holding company (Willy):** 0% — fully legal
- **Educational goal:** Show that the middle class pays the most tax *relative to gains*, while the ultra-wealthy avoid it entirely through structure

---

## Deploying online (optional)

If you want students to connect from home or via school WiFi without local network:

1. Push to GitHub
2. Deploy on [Railway](https://railway.app) or [Render](https://render.com) (both free tier)
3. Share the public URL

No env variables needed — the server runs as-is.

---

## Vercel deployment

This repository is now Vercel-ready with serverless API endpoints:

- `POST /api/game` for host/player actions
- `GET /api/game?action=get_state&code=XXXXX` for polling updates

Online URLs:

- Host: `https://ugent-meerwaarde-game.vercel.app/host.html`
- Player: `https://ugent-meerwaarde-game.vercel.app/player.html`

For automatic preview deployments on every push:

1. Connect your GitHub account as a Vercel Login Connection
2. Run `vercel git connect https://github.com/thibaulthellebuyck0-boop/UGENT-MEERWAARDE-GAME`
3. Push feature branches to GitHub
