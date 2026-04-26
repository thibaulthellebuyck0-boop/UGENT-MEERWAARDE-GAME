const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
// GAME CONSTANTS  (mirrored in public/game-engine.js)
// ─────────────────────────────────────────────
const CHARACTERS = {
  fernand:    { id:'fernand',    name:'Fernand',      emoji:'🧍', color:'#ef4444', job:'Factory Worker',           startingCash:4_800,       incomePerRound:9_600,       taxType:'personal' },
  sofie:      { id:'sofie',      name:'Sofie',        emoji:'👩‍💼', color:'#f97316', job:'HR Manager',               startingCash:12_000,      incomePerRound:24_000,      taxType:'personal' },
  vanessa:    { id:'vanessa',    name:'Vanessa',      emoji:'👩‍🦱', color:'#eab308', job:'Senior Consultant',        startingCash:30_000,      incomePerRound:60_000,      taxType:'personal' },
  bart:       { id:'bart',       name:'Bart',         emoji:'🏭', color:'#22c55e', job:'Concrete Plant Owner',     startingCash:360_000,     incomePerRound:720_000,     taxType:'personal' },
  willy:      { id:'willy',      name:'Willy',        emoji:'🎩', color:'#a855f7', job:'Private Equity Investor',  startingCash:180_000_000, incomePerRound:360_000_000, taxType:'company'  },
  mariejeanne:{ id:'mariejeanne',name:'Marie-Jeanne', emoji:'📈', color:'#06b6d4', job:'Stock Market Investor',    startingCash:180_000_000, incomePerRound:360_000_000, taxType:'personal' },
};
const CHAR_ORDER = ['fernand','sofie','vanessa','bart','willy','mariejeanne'];

const ASSETS = {
  GOOGL:   { name:'Alphabet',           type:'stock', emoji:'🔍', mu:0.12, sigma:0.25 },
  NVDA:    { name:'Nvidia',             type:'stock', emoji:'🖥️', mu:0.22, sigma:0.50 },
  IONQ:    { name:'IonQ',              type:'stock', emoji:'⚛️', mu:0.20, sigma:0.90 },
  DUOL:    { name:'Duolingo',           type:'stock', emoji:'🦉', mu:0.18, sigma:0.55 },
  BRK:     { name:'Berkshire Hathaway', type:'stock', emoji:'🏛️', mu:0.10, sigma:0.15 },
  SHEL:    { name:'Shell',              type:'stock', emoji:'🛢️', mu:0.06, sigma:0.22 },
  BNP:     { name:'BNP Paribas',        type:'stock', emoji:'🏦', mu:0.08, sigma:0.28 },
  BELBOND: { name:'Belgium Bond',       type:'bond',  emoji:'🇧🇪', mu:0.03, sigma:0.02  },
  GERBOND: { name:'Germany Bond',       type:'bond',  emoji:'🇩🇪', mu:0.025,sigma:0.015 },
  USBOND:  { name:'US Treasury',        type:'bond',  emoji:'🇺🇸', mu:0.04, sigma:0.02  },
  SP500:   { name:'S&P 500 ETF',        type:'etf',   emoji:'📊', mu:0.10, sigma:0.15 },
  NDX:     { name:'Nasdaq 100 ETF',     type:'etf',   emoji:'💻', mu:0.13, sigma:0.20 },
  MSCI:    { name:'MSCI World ETF',     type:'etf',   emoji:'🌍', mu:0.09, sigma:0.14 },
};

const ROUND_YEARS   = 10;
const TOTAL_ROUNDS  = 3;
const TAX_RATE      = 0.10;
const ANNUAL_EXEMPT = 6_000;
const ROUND_EXEMPT  = ANNUAL_EXEMPT * ROUND_YEARS; // €60,000

// ─────────────────────────────────────────────
// PURE FUNCTIONS
// ─────────────────────────────────────────────
function seededRng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randNormal(rng) {
  const u1 = Math.max(1e-10, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function simulateReturn(ticker, roundSeed) {
  const a = ASSETS[ticker];
  const h = ticker.split('').reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 0);
  const rng = seededRng((roundSeed ^ h) >>> 0);
  let p = 1.0;
  for (let y = 0; y < ROUND_YEARS; y++) {
    p *= Math.exp((a.mu - 0.5 * a.sigma ** 2) + a.sigma * randNormal(rng));
  }
  return Math.round(p * 10000) / 10000;
}

function generatePrices(roundSeed) {
  const out = {};
  for (const t of Object.keys(ASSETS)) out[t] = simulateReturn(t, roundSeed);
  return out;
}

function calcTax(charId, realizedGains) {
  if (CHARACTERS[charId].taxType === 'company') return 0;
  return Math.round(Math.max(0, realizedGains - ROUND_EXEMPT) * TAX_RATE);
}

function portfolioValue(portfolio, prices) {
  if (!portfolio) return 0;
  return Object.entries(portfolio).reduce((s, [t, pos]) => s + pos.cost * (prices[t] || 1), 0);
}

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ─────────────────────────────────────────────
// GAME STATE
// ─────────────────────────────────────────────
const games = {}; // { [code]: game }

function newGame(code) {
  return {
    code,
    meta: { status: 'lobby', round: 1, seed: Math.floor(Math.random() * 1e9) },
    players: {},    // { [charId]: playerState }
    prices: {},     // { [round]: { [ticker]: multiplier } }
    hostSocketId: null,
  };
}

function newPlayer(charId) {
  return {
    charId,
    socketId: null,
    cash: CHARACTERS[charId].startingCash,
    portfolio: {},
    totalWealth: CHARACTERS[charId].startingCash,
    totalTaxPaid: 0,
    submitted: false,
    ready: false,
  };
}

// Strip socket IDs before sending to clients
function publicState(game) {
  const g = JSON.parse(JSON.stringify(game));
  delete g.hostSocketId;
  Object.values(g.players).forEach(p => delete p.socketId);
  return g;
}

// ─────────────────────────────────────────────
// ORDER PROCESSING  (runs on server)
// ─────────────────────────────────────────────
function processOrders(game, charId, orders) {
  const player = game.players[charId];
  const round  = game.meta.round;
  const prices = game.prices[round] || {};

  for (const { ticker, type, amount } of orders) {
    if (!ASSETS[ticker] || amount <= 0) continue;

    if (type === 'buy') {
      if (amount > player.cash) continue;
      player.cash -= amount;
      if (!player.portfolio[ticker]) player.portfolio[ticker] = { cost: 0 };
      player.portfolio[ticker].cost += amount;

    } else if (type === 'sell') {
      if (round <= 1) continue; // can't sell in round 1
      const pos = player.portfolio[ticker];
      if (!pos || pos.cost <= 0) continue;
      const mult      = prices[ticker] || 1;
      const maxSell   = pos.cost * mult;
      const sellVal   = Math.min(amount, maxSell);
      const costSold  = sellVal / mult;
      const gain      = sellVal - costSold;
      const tax       = calcTax(charId, gain);

      pos.cost -= costSold;
      if (pos.cost < 0.01) delete player.portfolio[ticker];
      player.cash         += sellVal - tax;
      player.totalTaxPaid += tax;
    }
  }

  player.submitted  = true;
  player.totalWealth = player.cash + portfolioValue(player.portfolio, prices);
}

// ─────────────────────────────────────────────
// SOCKET.IO
// ─────────────────────────────────────────────
io.on('connection', (socket) => {

  // ── HOST: create game ──────────────────────
  socket.on('host_create', (_, cb) => {
    const code = makeCode();
    games[code] = newGame(code);
    games[code].hostSocketId = socket.id;
    socket.join(code);
    cb({ code, state: publicState(games[code]) });
    console.log(`[+] Game created: ${code}`);
  });

  // ── PLAYER: join game ──────────────────────
  socket.on('join_game', ({ code }, cb) => {
    const game = games[code];
    if (!game) return cb({ error: 'Game not found. Check the code.' });
    if (game.meta.status !== 'lobby') return cb({ error: 'Game already started.' });

    const taken = Object.keys(game.players);
    const charId = CHAR_ORDER.find(c => !taken.includes(c));
    if (!charId) return cb({ error: 'Game is full (6 players).' });

    const player = newPlayer(charId);
    player.socketId = socket.id;
    game.players[charId] = player;

    socket.join(code);
    socket.data = { code, charId };

    cb({ charId, state: publicState(game) });
    io.to(code).emit('game_update', publicState(game));
    console.log(`[+] ${charId} joined ${code}`);
  });

  // ── PLAYER: ready after character reveal ───
  socket.on('player_ready', ({ code, charId }) => {
    const game = games[code];
    if (!game?.players[charId]) return;
    game.players[charId].ready = true;
    io.to(code).emit('game_update', publicState(game));
  });

  // ── PLAYER: submit investment orders ───────
  socket.on('submit_orders', ({ code, charId, orders }, cb) => {
    const game = games[code];
    if (!game) return cb?.({ error: 'Game not found.' });
    if (!game.players[charId]) return cb?.({ error: 'Player not found.' });
    if (game.players[charId].submitted) return cb?.({ error: 'Already submitted.' });
    if (game.meta.status !== 'investing') return cb?.({ error: 'Not in investing phase.' });

    processOrders(game, charId, orders);
    io.to(code).emit('game_update', publicState(game));
    cb?.({ ok: true });
  });

  // ── HOST: game actions ─────────────────────
  socket.on('host_action', ({ code, action }, cb) => {
    const game = games[code];
    if (!game) return cb?.({ error: 'Game not found.' });

    if (action === 'start_round') {
      const round = game.meta.round;
      // Add income for rounds 2+
      if (round > 1) {
        for (const [charId, player] of Object.entries(game.players)) {
          player.cash     += CHARACTERS[charId].incomePerRound;
          player.submitted = false;
          player.ready     = false;
          player.totalWealth = player.cash + portfolioValue(player.portfolio, {});
        }
      }
      game.meta.status = 'investing';
      io.to(code).emit('game_update', publicState(game));
      cb?.({ ok: true });

    } else if (action === 'reveal_prices') {
      const round     = game.meta.round;
      const roundSeed = (game.meta.seed ^ (round * 0x9e3779b9)) >>> 0;
      game.prices[round] = generatePrices(roundSeed);

      // Recalculate wealth with new prices
      for (const player of Object.values(game.players)) {
        player.totalWealth = player.cash + portfolioValue(player.portfolio, game.prices[round]);
      }

      game.meta.status = 'revealing';
      io.to(code).emit('game_update', publicState(game));
      cb?.({ ok: true });

    } else if (action === 'next_round') {
      if (game.meta.round >= TOTAL_ROUNDS) {
        game.meta.status = 'gameover';
      } else {
        game.meta.round += 1;
        game.meta.status = 'investing';
        for (const [charId, player] of Object.entries(game.players)) {
          player.cash     += CHARACTERS[charId].incomePerRound;
          player.submitted = false;
          player.ready     = false;
          player.totalWealth = player.cash + portfolioValue(player.portfolio, {});
        }
      }
      io.to(code).emit('game_update', publicState(game));
      cb?.({ ok: true });

    } else if (action === 'end_game') {
      game.meta.status = 'gameover';
      io.to(code).emit('game_update', publicState(game));
      cb?.({ ok: true });
    }
  });

  // ── Disconnect ─────────────────────────────
  socket.on('disconnect', () => {
    const { code, charId } = socket.data || {};
    if (code && charId && games[code]?.players[charId]) {
      games[code].players[charId].socketId = null;
      io.to(code).emit('game_update', publicState(games[code]));
    }
  });
});

// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🎮 Tax Wars running → http://localhost:${PORT}`);
  console.log(`   Host:   http://localhost:${PORT}/host.html`);
  console.log(`   Player: http://localhost:${PORT}/player.html\n`);
});
