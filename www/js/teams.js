/* =====================================================================
   PENALTY KINGS — Team data
   ---------------------------------------------------------------------
   48 national teams for a fictional international penalty cup. The group
   draw is randomized at the start of every tournament (see drawGroups);
   this game is unofficial and not affiliated with any real competition.

   To change a team (e.g. if a qualifier differs), just edit its line.
     name   – display name
     code   – 3-letter code shown on the scoreboard
     group  – seed group (the live tournament draw is randomized)
     flag   – emoji flag (renders on macOS / iOS)
     c1     – primary kit colour (shirt)
     c2     – secondary kit colour (shorts / trim)
     str    – strength 55..93 (drives AI difficulty + simulation)
   ===================================================================== */

const TEAMS = [
  // Group A
  { name: "Mexico",            code: "MEX", group: "A", flag: "🇲🇽", c1: "#0a6b3b", c2: "#ffffff", str: 80 },
  { name: "South Africa",      code: "RSA", group: "A", flag: "🇿🇦", c1: "#f4c430", c2: "#0a7a3b", str: 68 },
  { name: "South Korea",       code: "KOR", group: "A", flag: "🇰🇷", c1: "#c8102e", c2: "#1f2a44", str: 76 },
  { name: "Czechia",           code: "CZE", group: "A", flag: "🇨🇿", c1: "#d7141a", c2: "#11457e", str: 74 },

  // Group B
  { name: "Canada",            code: "CAN", group: "B", flag: "🇨🇦", c1: "#d52b1e", c2: "#ffffff", str: 75 },
  { name: "Bosnia & H.",       code: "BIH", group: "B", flag: "🇧🇦", c1: "#0033a0", c2: "#fecb00", str: 72 },
  { name: "Qatar",             code: "QAT", group: "B", flag: "🇶🇦", c1: "#8a1538", c2: "#ffffff", str: 70 },
  { name: "Switzerland",       code: "SUI", group: "B", flag: "🇨🇭", c1: "#d52b1e", c2: "#ffffff", str: 81 },

  // Group C
  { name: "Brazil",            code: "BRA", group: "C", flag: "🇧🇷", c1: "#ffdf00", c2: "#0a2472", str: 92 },
  { name: "Morocco",           code: "MAR", group: "C", flag: "🇲🇦", c1: "#c1272d", c2: "#006233", str: 83 },
  { name: "Haiti",             code: "HAI", group: "C", flag: "🇭🇹", c1: "#00209f", c2: "#d21034", str: 62 },
  { name: "Scotland",          code: "SCO", group: "C", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", c1: "#0a1f44", c2: "#ffffff", str: 73 },

  // Group D
  { name: "United States",     code: "USA", group: "D", flag: "🇺🇸", c1: "#ffffff", c2: "#002868", str: 78 },
  { name: "Paraguay",          code: "PAR", group: "D", flag: "🇵🇾", c1: "#d52b1e", c2: "#0038a8", str: 74 },
  { name: "Australia",         code: "AUS", group: "D", flag: "🇦🇺", c1: "#ffcd00", c2: "#00843d", str: 76 },
  { name: "Türkiye",           code: "TUR", group: "D", flag: "🇹🇷", c1: "#e30a17", c2: "#ffffff", str: 79 },

  // Group E
  { name: "Germany",           code: "GER", group: "E", flag: "🇩🇪", c1: "#ffffff", c2: "#1a1a1a", str: 88 },
  { name: "Curaçao",           code: "CUW", group: "E", flag: "🇨🇼", c1: "#002b7f", c2: "#f9d616", str: 60 },
  { name: "Ivory Coast",       code: "CIV", group: "E", flag: "🇨🇮", c1: "#ff8200", c2: "#009a44", str: 79 },
  { name: "Ecuador",           code: "ECU", group: "E", flag: "🇪🇨", c1: "#ffd100", c2: "#003893", str: 75 },

  // Group F
  { name: "Netherlands",       code: "NED", group: "F", flag: "🇳🇱", c1: "#ff7f00", c2: "#ffffff", str: 86 },
  { name: "Japan",             code: "JPN", group: "F", flag: "🇯🇵", c1: "#0033a0", c2: "#ffffff", str: 80 },
  { name: "Sweden",            code: "SWE", group: "F", flag: "🇸🇪", c1: "#fecc00", c2: "#006aa7", str: 76 },
  { name: "Tunisia",           code: "TUN", group: "F", flag: "🇹🇳", c1: "#e70013", c2: "#ffffff", str: 71 },

  // Group G
  { name: "Belgium",           code: "BEL", group: "G", flag: "🇧🇪", c1: "#e30613", c2: "#1a1a1a", str: 85 },
  { name: "Egypt",             code: "EGY", group: "G", flag: "🇪🇬", c1: "#ce1126", c2: "#1a1a1a", str: 74 },
  { name: "Iran",              code: "IRN", group: "G", flag: "🇮🇷", c1: "#ffffff", c2: "#239f40", str: 73 },
  { name: "New Zealand",       code: "NZL", group: "G", flag: "🇳🇿", c1: "#1a1a1a", c2: "#ffffff", str: 64 },

  // Group H
  { name: "Spain",             code: "ESP", group: "H", flag: "🇪🇸", c1: "#c60b1e", c2: "#ffc400", str: 91 },
  { name: "Cape Verde",        code: "CPV", group: "H", flag: "🇨🇻", c1: "#003893", c2: "#ffffff", str: 63 },
  { name: "Saudi Arabia",      code: "KSA", group: "H", flag: "🇸🇦", c1: "#006c35", c2: "#ffffff", str: 69 },
  { name: "Uruguay",           code: "URU", group: "H", flag: "🇺🇾", c1: "#5cbfeb", c2: "#1a1a1a", str: 84 },

  // Group I
  { name: "France",            code: "FRA", group: "I", flag: "🇫🇷", c1: "#002395", c2: "#ffffff", str: 90 },
  { name: "Senegal",           code: "SEN", group: "I", flag: "🇸🇳", c1: "#00853f", c2: "#ffffff", str: 82 },
  { name: "Iraq",              code: "IRQ", group: "I", flag: "🇮🇶", c1: "#ffffff", c2: "#1a7a3b", str: 67 },
  { name: "Norway",            code: "NOR", group: "I", flag: "🇳🇴", c1: "#ba0c2f", c2: "#00205b", str: 80 },

  // Group J
  { name: "Argentina",         code: "ARG", group: "J", flag: "🇦🇷", c1: "#75aadb", c2: "#ffffff", str: 92 },
  { name: "Algeria",           code: "ALG", group: "J", flag: "🇩🇿", c1: "#006233", c2: "#ffffff", str: 78 },
  { name: "Austria",           code: "AUT", group: "J", flag: "🇦🇹", c1: "#ed2939", c2: "#ffffff", str: 79 },
  { name: "Jordan",            code: "JOR", group: "J", flag: "🇯🇴", c1: "#ffffff", c2: "#ce1126", str: 66 },

  // Group K
  { name: "Portugal",          code: "POR", group: "K", flag: "🇵🇹", c1: "#c8102e", c2: "#006600", str: 89 },
  { name: "DR Congo",          code: "COD", group: "K", flag: "🇨🇩", c1: "#007fff", c2: "#f7d518", str: 72 },
  { name: "Uzbekistan",        code: "UZB", group: "K", flag: "🇺🇿", c1: "#ffffff", c2: "#1eb53a", str: 70 },
  { name: "Colombia",          code: "COL", group: "K", flag: "🇨🇴", c1: "#fcd116", c2: "#003893", str: 83 },

  // Group L
  { name: "England",           code: "ENG", group: "L", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", c1: "#ffffff", c2: "#0a1f44", str: 88 },
  { name: "Croatia",           code: "CRO", group: "L", flag: "🇭🇷", c1: "#ff0000", c2: "#ffffff", str: 85 },
  { name: "Ghana",             code: "GHA", group: "L", flag: "🇬🇭", c1: "#ffffff", c2: "#006b3f", str: 75 },
  { name: "Panama",            code: "PAN", group: "L", flag: "🇵🇦", c1: "#da121a", c2: "#072357", str: 68 },
];

const GROUP_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

/* Teams keyed by group letter, in draw order. */
function teamsByGroup() {
  const g = {};
  GROUP_LETTERS.forEach((L) => (g[L] = []));
  TEAMS.forEach((t) => g[t.group].push(t));
  return g;
}

/* Randomized draw: shuffle all 48 teams into 12 groups of 4. A fresh,
   fictional draw each tournament — not any official real-world draw. */
function drawGroups() {
  const pool = TEAMS.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }
  const g = {};
  GROUP_LETTERS.forEach((L, gi) => { g[L] = pool.slice(gi * 4, gi * 4 + 4); });
  return g;
}

function teamByCode(code) {
  return TEAMS.find((t) => t.code === code) || null;
}
