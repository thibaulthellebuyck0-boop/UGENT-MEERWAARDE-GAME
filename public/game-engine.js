// ── Shared game constants (browser version) ──────────────────
// This file is loaded by both player.html and host.html

const CHARACTERS = {
  fernand:     { id:'fernand',     name:'Fernand',      emoji:'🧍', color:'#ef4444', job:'Factory Worker',          startingCash:4_800,       incomePerRound:9_600,       taxType:'personal', tagline:'Works hard, earns little.',              taxNote:'Pays 10% capital gains tax — gains often stay below the €60k exemption.' },
  sofie:       { id:'sofie',       name:'Sofie',        emoji:'👩‍💼', color:'#f97316', job:'HR Manager',              startingCash:12_000,      incomePerRound:24_000,      taxType:'personal', tagline:'Stable income, building wealth slowly.',  taxNote:'Pays 10% capital gains tax. Middle class getting squeezed.' },
  vanessa:     { id:'vanessa',     name:'Vanessa',      emoji:'👩‍🦱', color:'#eab308', job:'Senior Consultant',       startingCash:30_000,      incomePerRound:60_000,      taxType:'personal', tagline:'Good salary, investing seriously.',        taxNote:'Pays 10% capital gains tax. Gains likely exceed exemption.' },
  bart:        { id:'bart',        name:'Bart',         emoji:'🏭', color:'#22c55e', job:'Concrete Plant Owner',    startingCash:360_000,     incomePerRound:720_000,     taxType:'personal', tagline:'West-Flemish businessman.',                taxNote:'Pays 10% capital gains tax. High gains = high tax bill.' },
  willy:       { id:'willy',       name:'Willy',        emoji:'🎩', color:'#a855f7', job:'Private Equity Investor', startingCash:180_000_000, incomePerRound:360_000_000, taxType:'company',  tagline:'Routes everything via a holding company.', taxNote:'0% capital gains tax. Holding company = fully legal tax avoidance.' },
  mariejeanne: { id:'mariejeanne', name:'Marie-Jeanne', emoji:'📈', color:'#06b6d4', job:'Stock Market Investor',   startingCash:180_000_000, incomePerRound:360_000_000, taxType:'personal', tagline:'Same wealth as Willy, invests personally.', taxNote:'10% capital gains tax. Same portfolio as Willy — massively different tax bill.' },
};

const CHAR_ORDER = ['fernand','sofie','vanessa','bart','willy','mariejeanne'];

const ASSETS = {
  GOOGL:   { ticker:'GOOGL',   name:'Alphabet',           type:'stock', emoji:'🔍' },
  NVDA:    { ticker:'NVDA',    name:'Nvidia',              type:'stock', emoji:'🖥️' },
  IONQ:    { ticker:'IONQ',    name:'IonQ',               type:'stock', emoji:'⚛️' },
  DUOL:    { ticker:'DUOL',    name:'Duolingo',            type:'stock', emoji:'🦉' },
  BRK:     { ticker:'BRK',     name:'Berkshire Hathaway',  type:'stock', emoji:'🏛️' },
  SHEL:    { ticker:'SHEL',    name:'Shell',               type:'stock', emoji:'🛢️' },
  BNP:     { ticker:'BNP',     name:'BNP Paribas',         type:'stock', emoji:'🏦' },
  BELBOND: { ticker:'BELBOND', name:'Belgium Bond',        type:'bond',  emoji:'🇧🇪' },
  GERBOND: { ticker:'GERBOND', name:'Germany Bond',        type:'bond',  emoji:'🇩🇪' },
  USBOND:  { ticker:'USBOND',  name:'US Treasury',         type:'bond',  emoji:'🇺🇸' },
  SP500:   { ticker:'SP500',   name:'S&amp;P 500 ETF',     type:'etf',   emoji:'📊' },
  NDX:     { ticker:'NDX',     name:'Nasdaq 100 ETF',      type:'etf',   emoji:'💻' },
  MSCI:    { ticker:'MSCI',    name:'MSCI World ETF',      type:'etf',   emoji:'🌍' },
};

const TOTAL_ROUNDS  = 3;
const ROUND_YEARS   = 10;
const ROUND_EXEMPT  = 60_000; // €6,000/yr × 10 yrs

// ── Formatting helpers ───────────────────────────────────────
function fmtNum(n) {
  const a = Math.abs(n);
  if (a >= 1e9) return (n/1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (n/1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (n/1e3).toFixed(1) + 'K';
  return Math.round(n).toLocaleString('nl-BE');
}
function fmtEuro(n)   { return '€' + fmtNum(n); }
function fmtPct(mult) { const p = ((mult-1)*100); return (p>=0?'+':'')+p.toFixed(1)+'%'; }

// ── Portfolio helpers ────────────────────────────────────────
function portfolioValue(portfolio, prices) {
  if (!portfolio) return 0;
  return Object.entries(portfolio).reduce((s,[t,pos]) => s + pos.cost*(prices[t]||1), 0);
}

function calcTax(charId, realizedGains) {
  if (CHARACTERS[charId].taxType === 'company') return 0;
  return Math.round(Math.max(0, realizedGains - ROUND_EXEMPT) * 0.10);
}
