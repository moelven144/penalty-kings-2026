// Penalty Kings v2 — the 48 nations (names, flags and colours only; no crests).
// IMPORTANT: challenge links store a nation by its INDEX in this list.
// Only ever APPEND new nations; never reorder or delete, or old links break.
// str (55..93) sets CPU skill.

export const TEAMS = [
  { code: "MEX", name: "Mexico", flag: "🇲🇽", c1: "#0a6b3b", c2: "#ffffff", str: 80 },
  { code: "RSA", name: "South Africa", flag: "🇿🇦", c1: "#f4c430", c2: "#0a7a3b", str: 68 },
  { code: "KOR", name: "South Korea", flag: "🇰🇷", c1: "#c8102e", c2: "#1f2a44", str: 76 },
  { code: "CZE", name: "Czechia", flag: "🇨🇿", c1: "#d7141a", c2: "#11457e", str: 74 },
  { code: "CAN", name: "Canada", flag: "🇨🇦", c1: "#d52b1e", c2: "#ffffff", str: 75 },
  { code: "BIH", name: "Bosnia & H.", flag: "🇧🇦", c1: "#0033a0", c2: "#fecb00", str: 72 },
  { code: "QAT", name: "Qatar", flag: "🇶🇦", c1: "#8a1538", c2: "#ffffff", str: 70 },
  { code: "SUI", name: "Switzerland", flag: "🇨🇭", c1: "#d52b1e", c2: "#ffffff", str: 81 },
  { code: "BRA", name: "Brazil", flag: "🇧🇷", c1: "#ffdf00", c2: "#0a2472", str: 92 },
  { code: "MAR", name: "Morocco", flag: "🇲🇦", c1: "#c1272d", c2: "#006233", str: 83 },
  { code: "HAI", name: "Haiti", flag: "🇭🇹", c1: "#00209f", c2: "#d21034", str: 62 },
  { code: "SCO", name: "Scotland", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", c1: "#0a1f44", c2: "#ffffff", str: 73 },
  { code: "USA", name: "United States", flag: "🇺🇸", c1: "#ffffff", c2: "#002868", str: 78 },
  { code: "PAR", name: "Paraguay", flag: "🇵🇾", c1: "#d52b1e", c2: "#0038a8", str: 74 },
  { code: "AUS", name: "Australia", flag: "🇦🇺", c1: "#ffcd00", c2: "#00843d", str: 76 },
  { code: "TUR", name: "Türkiye", flag: "🇹🇷", c1: "#e30a17", c2: "#ffffff", str: 79 },
  { code: "GER", name: "Germany", flag: "🇩🇪", c1: "#ffffff", c2: "#1a1a1a", str: 88 },
  { code: "CUW", name: "Curaçao", flag: "🇨🇼", c1: "#002b7f", c2: "#f9d616", str: 60 },
  { code: "CIV", name: "Ivory Coast", flag: "🇨🇮", c1: "#ff8200", c2: "#009a44", str: 79 },
  { code: "ECU", name: "Ecuador", flag: "🇪🇨", c1: "#ffd100", c2: "#003893", str: 75 },
  { code: "NED", name: "Netherlands", flag: "🇳🇱", c1: "#ff7f00", c2: "#ffffff", str: 86 },
  { code: "JPN", name: "Japan", flag: "🇯🇵", c1: "#0033a0", c2: "#ffffff", str: 80 },
  { code: "SWE", name: "Sweden", flag: "🇸🇪", c1: "#fecc00", c2: "#006aa7", str: 76 },
  { code: "TUN", name: "Tunisia", flag: "🇹🇳", c1: "#e70013", c2: "#ffffff", str: 71 },
  { code: "BEL", name: "Belgium", flag: "🇧🇪", c1: "#e30613", c2: "#1a1a1a", str: 85 },
  { code: "EGY", name: "Egypt", flag: "🇪🇬", c1: "#ce1126", c2: "#1a1a1a", str: 74 },
  { code: "IRN", name: "Iran", flag: "🇮🇷", c1: "#ffffff", c2: "#239f40", str: 73 },
  { code: "NZL", name: "New Zealand", flag: "🇳🇿", c1: "#1a1a1a", c2: "#ffffff", str: 64 },
  { code: "ESP", name: "Spain", flag: "🇪🇸", c1: "#c60b1e", c2: "#ffc400", str: 91 },
  { code: "CPV", name: "Cape Verde", flag: "🇨🇻", c1: "#003893", c2: "#ffffff", str: 63 },
  { code: "KSA", name: "Saudi Arabia", flag: "🇸🇦", c1: "#006c35", c2: "#ffffff", str: 69 },
  { code: "URU", name: "Uruguay", flag: "🇺🇾", c1: "#5cbfeb", c2: "#1a1a1a", str: 84 },
  { code: "FRA", name: "France", flag: "🇫🇷", c1: "#002395", c2: "#ffffff", str: 90 },
  { code: "SEN", name: "Senegal", flag: "🇸🇳", c1: "#00853f", c2: "#ffffff", str: 82 },
  { code: "IRQ", name: "Iraq", flag: "🇮🇶", c1: "#ffffff", c2: "#1a7a3b", str: 67 },
  { code: "NOR", name: "Norway", flag: "🇳🇴", c1: "#ba0c2f", c2: "#00205b", str: 80 },
  { code: "ARG", name: "Argentina", flag: "🇦🇷", c1: "#75aadb", c2: "#ffffff", str: 92 },
  { code: "ALG", name: "Algeria", flag: "🇩🇿", c1: "#006233", c2: "#ffffff", str: 78 },
  { code: "AUT", name: "Austria", flag: "🇦🇹", c1: "#ed2939", c2: "#ffffff", str: 79 },
  { code: "JOR", name: "Jordan", flag: "🇯🇴", c1: "#ffffff", c2: "#ce1126", str: 66 },
  { code: "POR", name: "Portugal", flag: "🇵🇹", c1: "#c8102e", c2: "#006600", str: 89 },
  { code: "COD", name: "DR Congo", flag: "🇨🇩", c1: "#007fff", c2: "#f7d518", str: 72 },
  { code: "UZB", name: "Uzbekistan", flag: "🇺🇿", c1: "#ffffff", c2: "#1eb53a", str: 70 },
  { code: "COL", name: "Colombia", flag: "🇨🇴", c1: "#fcd116", c2: "#003893", str: 83 },
  { code: "ENG", name: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", c1: "#ffffff", c2: "#0a1f44", str: 88 },
  { code: "CRO", name: "Croatia", flag: "🇭🇷", c1: "#ff0000", c2: "#ffffff", str: 85 },
  { code: "GHA", name: "Ghana", flag: "🇬🇭", c1: "#ffffff", c2: "#006b3f", str: 75 },
  { code: "PAN", name: "Panama", flag: "🇵🇦", c1: "#da121a", c2: "#072357", str: 68 },
];

export const teamIndex = (code) => TEAMS.findIndex((t) => t.code === code);

/** Visible CPU stats (0..1) derived from team strength. */
export function cpuStats(team) {
  const s = (team.str - 55) / 38;
  return {
    finishing: 0.35 + 0.55 * s,
    disguise: 0.3 + 0.5 * s,
    keeper: { reach: 0.35 + 0.55 * s, reaction: 0.3 + 0.6 * s, reading: 0.3 + 0.55 * s },
  };
}
