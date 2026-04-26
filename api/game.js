const TAX_RATE = 0.10;
const ANNUAL_EXEMPT = 6000;
const ROUND_YEARS = 10;
const ROUND_EXEMPT = ANNUAL_EXEMPT * ROUND_YEARS;
const TOTAL_ROUNDS = 3;

const CHARACTERS = {
  fernand: { id: "fernand", startingCash: 4_800, incomePerRound: 9_600, taxType: "personal" },
  sofie: { id: "sofie", startingCash: 12_000, incomePerRound: 24_000, taxType: "personal" },
  vanessa: { id: "vanessa", startingCash: 30_000, incomePerRound: 60_000, taxType: "personal" },
  bart: { id: "bart", startingCash: 360_000, incomePerRound: 720_000, taxType: "personal" },
  willy: { id: "willy", startingCash: 180_000_000, incomePerRound: 360_000_000, taxType: "company" },
  mariejeanne: { id: "mariejeanne", startingCash: 180_000_000, incomePerRound: 360_000_000, taxType: "personal" },
};
const CHAR_ORDER = ["fernand", "sofie", "vanessa", "bart", "willy", "mariejeanne"];

const ASSETS = {
  GOOGL: { mu: 0.12, sigma: 0.25 },
  NVDA: { mu: 0.22, sigma: 0.50 },
  IONQ: { mu: 0.20, sigma: 0.90 },
  DUOL: { mu: 0.18, sigma: 0.55 },
  BRK: { mu: 0.10, sigma: 0.15 },
  SHEL: { mu: 0.06, sigma: 0.22 },
  BNP: { mu: 0.08, sigma: 0.28 },
  BELBOND: { mu: 0.03, sigma: 0.02 },
  GERBOND: { mu: 0.025, sigma: 0.015 },
  USBOND: { mu: 0.04, sigma: 0.02 },
  SP500: { mu: 0.10, sigma: 0.15 },
  NDX: { mu: 0.13, sigma: 0.20 },
  MSCI: { mu: 0.09, sigma: 0.14 },
};

const memoryGames = globalThis.__taxwars_games || {};
globalThis.__taxwars_games = memoryGames;

function seededRng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
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
  const h = ticker.split("").reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 0);
  const rng = seededRng((roundSeed ^ h) >>> 0);
  let p = 1.0;
  for (let y = 0; y < ROUND_YEARS; y += 1) p *= Math.exp((a.mu - 0.5 * a.sigma ** 2) + a.sigma * randNormal(rng));
  return Math.round(p * 10000) / 10000;
}

function generatePrices(roundSeed) {
  const out = {};
  for (const t of Object.keys(ASSETS)) out[t] = simulateReturn(t, roundSeed);
  return out;
}

function portfolioValue(portfolio, prices) {
  if (!portfolio) return 0;
  return Object.entries(portfolio).reduce((s, [t, pos]) => s + pos.cost * (prices[t] || 1), 0);
}

function calcTax(charId, realizedGains) {
  if (CHARACTERS[charId].taxType === "company") return 0;
  return Math.round(Math.max(0, realizedGains - ROUND_EXEMPT) * TAX_RATE);
}

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function newGame(code) {
  return {
    code,
    meta: { status: "lobby", round: 1, seed: Math.floor(Math.random() * 1e9), updatedAt: Date.now() },
    players: {},
    prices: {},
  };
}

function newPlayer(charId) {
  return {
    charId,
    cash: CHARACTERS[charId].startingCash,
    portfolio: {},
    totalWealth: CHARACTERS[charId].startingCash,
    totalTaxPaid: 0,
    submitted: false,
    ready: false,
  };
}

function processOrders(game, charId, orders) {
  const player = game.players[charId];
  const round = game.meta.round;
  const prices = game.prices[round] || {};

  for (const { ticker, type, amount } of orders || []) {
    if (!ASSETS[ticker] || amount <= 0) continue;
    if (type === "buy") {
      if (amount > player.cash) continue;
      player.cash -= amount;
      if (!player.portfolio[ticker]) player.portfolio[ticker] = { cost: 0 };
      player.portfolio[ticker].cost += amount;
    } else if (type === "sell") {
      if (round <= 1) continue;
      const pos = player.portfolio[ticker];
      if (!pos || pos.cost <= 0) continue;
      const mult = prices[ticker] || 1;
      const maxSell = pos.cost * mult;
      const sellVal = Math.min(amount, maxSell);
      const costSold = sellVal / mult;
      const gain = sellVal - costSold;
      const tax = calcTax(charId, gain);
      pos.cost -= costSold;
      if (pos.cost < 0.01) delete player.portfolio[ticker];
      player.cash += sellVal - tax;
      player.totalTaxPaid += tax;
    }
  }
  player.submitted = true;
  player.totalWealth = player.cash + portfolioValue(player.portfolio, prices);
}

function touch(game) {
  game.meta.updatedAt = Date.now();
}

function send(res, code, payload) {
  res.status(code).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  const method = req.method || "GET";
  const input = method === "GET" ? req.query : (req.body || {});
  const action = input.action;

  if (!action) return send(res, 400, { error: "Missing action" });

  if (action === "host_create") {
    let code = makeCode();
    while (memoryGames[code]) code = makeCode();
    const game = newGame(code);
    memoryGames[code] = game;
    return send(res, 200, { code, state: game });
  }

  const code = String(input.code || "").toUpperCase();
  const game = memoryGames[code];
  if (!game) return send(res, 404, { error: "Game not found. Check the code." });

  if (action === "get_state") return send(res, 200, { state: game });

  if (action === "join_game") {
    if (game.meta.status !== "lobby") return send(res, 400, { error: "Game already started." });
    const taken = Object.keys(game.players);
    const charId = CHAR_ORDER.find((c) => !taken.includes(c));
    if (!charId) return send(res, 400, { error: "Game is full (6 players)." });
    game.players[charId] = newPlayer(charId);
    touch(game);
    return send(res, 200, { charId, state: game });
  }

  if (action === "player_ready") {
    const { charId } = input;
    if (!game.players[charId]) return send(res, 400, { error: "Player not found." });
    game.players[charId].ready = true;
    touch(game);
    return send(res, 200, { ok: true, state: game });
  }

  if (action === "submit_orders") {
    const { charId, orders } = input;
    if (!game.players[charId]) return send(res, 400, { error: "Player not found." });
    if (game.players[charId].submitted) return send(res, 400, { error: "Already submitted." });
    if (game.meta.status !== "investing") return send(res, 400, { error: "Not in investing phase." });
    processOrders(game, charId, orders);
    touch(game);
    return send(res, 200, { ok: true, state: game });
  }

  if (action === "host_action") {
    const { hostAction } = input;
    const round = game.meta.round;
    if (hostAction === "start_round") {
      if (round > 1) {
        for (const [charId, player] of Object.entries(game.players)) {
          player.cash += CHARACTERS[charId].incomePerRound;
          player.submitted = false;
          player.ready = false;
          player.totalWealth = player.cash + portfolioValue(player.portfolio, {});
        }
      }
      game.meta.status = "investing";
    } else if (hostAction === "reveal_prices") {
      const roundSeed = (game.meta.seed ^ (round * 0x9e3779b9)) >>> 0;
      game.prices[round] = generatePrices(roundSeed);
      for (const player of Object.values(game.players)) {
        player.totalWealth = player.cash + portfolioValue(player.portfolio, game.prices[round]);
      }
      game.meta.status = "revealing";
    } else if (hostAction === "next_round") {
      if (game.meta.round >= TOTAL_ROUNDS) {
        game.meta.status = "gameover";
      } else {
        game.meta.round += 1;
        game.meta.status = "investing";
        for (const [charId, player] of Object.entries(game.players)) {
          player.cash += CHARACTERS[charId].incomePerRound;
          player.submitted = false;
          player.ready = false;
          player.totalWealth = player.cash + portfolioValue(player.portfolio, {});
        }
      }
    } else if (hostAction === "end_game") {
      game.meta.status = "gameover";
    } else {
      return send(res, 400, { error: "Unknown host action" });
    }
    touch(game);
    return send(res, 200, { ok: true, state: game });
  }

  return send(res, 400, { error: "Unknown action" });
};
