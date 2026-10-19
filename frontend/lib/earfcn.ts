// =============================================================================
// earfcn.ts — EARFCN/NR-ARFCN ↔ frequency and band
// =============================================================================
// LTE: 3GPP TS 36.101 §5.7.3 (Table 5.7.3-1), F = F_low + 0.1 × (N − N_Offs),
// with separate DL and UL channel numbers for FDD bands.
// NR: 3GPP TS 38.104 §5.4.2.1 global frequency raster (the same NR-ARFCN
// numbering for DL and UL) and the band ranges of TS 38.101-1/-2.
// Used by the Frequency Calculator; frontend only.
// =============================================================================

// --- LTE Band Table (3GPP TS 36.101) ----------------------------------------

export interface LTEBandEntry {
  band: number;
  /** Common / marketing name for the band */
  name: string;
  /** DL low edge in MHz */
  dlLow: number;
  /** UL low edge in MHz (same as dlLow for TDD, 0 for SDL) */
  ulLow: number;
  /** EARFCN offset (N_Offs-DL) */
  earfcnOffset: number;
  /** Valid DL EARFCN range [min, max] */
  earfcnRange: [number, number];
  /** UL EARFCN offset (N_Offs-UL), FDD only */
  ulEarfcnOffset?: number;
  /** Valid UL EARFCN range, FDD only */
  ulEarfcnRange?: [number, number];
  /** Channel spacing in MHz (always 0.1 for LTE) */
  spacing: number;
  /** Duplex mode */
  duplexType: "FDD" | "TDD" | "SDL";
}

function fdd(
  band: number,
  name: string,
  dlLow: number,
  dl: [number, number],
  ulLow: number,
  ul: [number, number],
): LTEBandEntry {
  return {
    band, name, dlLow, ulLow,
    earfcnOffset: dl[0], earfcnRange: dl,
    ulEarfcnOffset: ul[0], ulEarfcnRange: ul,
    spacing: 0.1, duplexType: "FDD",
  };
}

function tdd(band: number, name: string, low: number, range: [number, number]): LTEBandEntry {
  return {
    band, name, dlLow: low, ulLow: low,
    earfcnOffset: range[0], earfcnRange: range,
    spacing: 0.1, duplexType: "TDD",
  };
}

function sdl(band: number, name: string, dlLow: number, range: [number, number]): LTEBandEntry {
  return {
    band, name, dlLow, ulLow: 0,
    earfcnOffset: range[0], earfcnRange: range,
    spacing: 0.1, duplexType: "SDL",
  };
}

export const LTE_BANDS: LTEBandEntry[] = [
  // FDD
  fdd(1, "IMT 2100", 2110, [0, 599], 1920, [18000, 18599]),
  fdd(2, "PCS 1900", 1930, [600, 1199], 1850, [18600, 19199]),
  fdd(3, "DCS 1800", 1805, [1200, 1949], 1710, [19200, 19949]),
  fdd(4, "AWS-1", 2110, [1950, 2399], 1710, [19950, 20399]),
  fdd(5, "CLR 850", 869, [2400, 2649], 824, [20400, 20649]),
  fdd(6, "UMTS 800", 875, [2650, 2749], 830, [20650, 20749]),
  fdd(7, "IMT-E 2600", 2620, [2750, 3449], 2500, [20750, 21449]),
  fdd(8, "GSM 900", 925, [3450, 3799], 880, [21450, 21799]),
  fdd(9, "UMTS 1700", 1844.9, [3800, 4149], 1749.9, [21800, 22149]),
  fdd(10, "Extended AWS", 2110, [4150, 4749], 1710, [22150, 22749]),
  fdd(11, "Lower PDC 1500", 1475.9, [4750, 4949], 1427.9, [22750, 22949]),
  fdd(12, "Lower 700 a", 729, [5010, 5179], 699, [23010, 23179]),
  fdd(13, "Upper 700 c", 746, [5180, 5279], 777, [23180, 23279]),
  fdd(14, "Upper 700 PS", 758, [5280, 5379], 788, [23280, 23379]),
  fdd(17, "Lower 700 b", 734, [5730, 5849], 704, [23730, 23849]),
  fdd(18, "Lower 800 (Japan)", 860, [5850, 5999], 815, [23850, 23999]),
  fdd(19, "Upper 800 (Japan)", 875, [6000, 6149], 830, [24000, 24149]),
  fdd(20, "EU 800 DD", 791, [6150, 6449], 832, [24150, 24449]),
  fdd(21, "Upper PDC 1500", 1495.9, [6450, 6599], 1447.9, [24450, 24599]),
  fdd(22, "3500 FDD", 3510, [6600, 7399], 3410, [24600, 25399]),
  fdd(23, "S-Band 2000", 2180, [7500, 7699], 2000, [25500, 25699]),
  fdd(24, "L-Band 1600", 1525, [7700, 8039], 1626.5, [25700, 26039]),
  fdd(25, "PCS 1900+", 1930, [8040, 8689], 1850, [26040, 26689]),
  fdd(26, "ESMR 850+", 859, [8690, 9039], 814, [26690, 27039]),
  fdd(27, "SMR 800", 852, [9040, 9209], 807, [27040, 27209]),
  fdd(28, "APT 700", 758, [9210, 9659], 703, [27210, 27659]),
  fdd(30, "WCS 2300", 2350, [9770, 9869], 2305, [27660, 27759]),
  fdd(31, "450", 462.5, [9870, 9919], 452.5, [27760, 27809]),
  fdd(65, "IMT 2100+", 2110, [65536, 66435], 1920, [131072, 131971]),
  fdd(66, "AWS-3", 2110, [66436, 67335], 1710, [131972, 132671]),
  fdd(68, "ME 700", 753, [67536, 67835], 698, [132672, 132971]),
  fdd(70, "AWS-4", 1995, [68336, 68585], 1695, [132972, 133121]),
  fdd(71, "600 MHz", 617, [68586, 68935], 663, [133122, 133471]),
  fdd(72, "PMR 450 a", 461, [68936, 68985], 451, [133472, 133521]),
  fdd(73, "PMR 450 b", 460, [68986, 69035], 450, [133522, 133571]),
  fdd(74, "L-Band 1500", 1475, [69036, 69465], 1427, [133572, 134001]),
  fdd(85, "Lower 700 a+", 728, [70366, 70545], 698, [134002, 134181]),
  fdd(87, "410", 420, [70546, 70595], 410, [134182, 134231]),
  fdd(88, "410+", 422, [70596, 70645], 412, [134232, 134281]),
  // SDL (supplemental downlink, no UL)
  sdl(29, "Lower 700 d", 717, [9660, 9769]),
  sdl(32, "L-Band 1500 SDL", 1452, [9920, 10359]),
  sdl(67, "EU 700 SDL", 738, [67336, 67535]),
  sdl(69, "IMT-E 2600 SDL", 2570, [67836, 68335]),
  sdl(75, "L-Band 1500 SDL+", 1432, [69466, 70315]),
  sdl(76, "L-Band 1427 SDL", 1427, [70316, 70365]),
  // TDD (UL = DL)
  tdd(33, "IMT 2000 TDD", 1900, [36000, 36199]),
  tdd(34, "IMT 2000 TDD", 2010, [36200, 36349]),
  tdd(35, "PCS 1900 TDD lower", 1850, [36350, 36949]),
  tdd(36, "PCS 1900 TDD upper", 1930, [36950, 37549]),
  tdd(37, "PCS centre gap", 1910, [37550, 37749]),
  tdd(38, "IMT-E 2600 TDD", 2570, [37750, 38249]),
  tdd(39, "DCS 1900 TDD", 1880, [38250, 38649]),
  tdd(40, "TD 2300", 2300, [38650, 39649]),
  tdd(41, "BRS/EBS", 2496, [39650, 41589]),
  tdd(42, "3500", 3400, [41590, 43589]),
  tdd(43, "3700", 3600, [43590, 45589]),
  tdd(44, "APT 700 TDD", 703, [45590, 46589]),
  tdd(45, "L-Band 1500 TDD", 1447, [46590, 46789]),
  tdd(46, "LAA 5 GHz", 5150, [46790, 54539]),
  tdd(47, "V2X 5.9 GHz", 5855, [54540, 55239]),
  tdd(48, "CBRS", 3550, [55240, 56739]),
  tdd(49, "CBRS LAA", 3550, [56740, 58239]),
  tdd(50, "L-Band 1500 TDD+", 1432, [58240, 59089]),
  tdd(51, "L-Band 1427 TDD", 1427, [59090, 59139]),
  tdd(52, "3300", 3300, [59140, 60139]),
  tdd(53, "S-Band 2400", 2483.5, [60140, 60254]),
];

// --- NR Band Table (3GPP TS 38.101-1 / 38.101-2, ranges per TS 38.104) ------

export interface NRBandEntry {
  band: number;
  name: string;
  /** UL low edge in MHz (same as DL low for TDD, 0 for SDL) */
  ulLow: number;
  /** UL high edge in MHz (0 for SDL) */
  ulHigh: number;
  /** DL low edge in MHz */
  dlLow: number;
  /** DL high edge in MHz */
  dlHigh: number;
  duplexType: "FDD" | "TDD" | "SDL";
  /** NR-ARFCN range for DL [min, max] */
  nrarfcnRange: [number, number];
}

function nrFdd(
  band: number, name: string,
  dl: [number, number], ul: [number, number], arfcn: [number, number],
): NRBandEntry {
  return { band, name, dlLow: dl[0], dlHigh: dl[1], ulLow: ul[0], ulHigh: ul[1], duplexType: "FDD", nrarfcnRange: arfcn };
}

function nrTdd(band: number, name: string, f: [number, number], arfcn: [number, number]): NRBandEntry {
  return { band, name, dlLow: f[0], dlHigh: f[1], ulLow: f[0], ulHigh: f[1], duplexType: "TDD", nrarfcnRange: arfcn };
}

function nrSdl(band: number, name: string, dl: [number, number], arfcn: [number, number]): NRBandEntry {
  return { band, name, dlLow: dl[0], dlHigh: dl[1], ulLow: 0, ulHigh: 0, duplexType: "SDL", nrarfcnRange: arfcn };
}

export const NR_BANDS: NRBandEntry[] = [
  // FDD (FR1)
  nrFdd(1, "IMT 2100", [2110, 2170], [1920, 1980], [422000, 434000]),
  nrFdd(2, "PCS 1900", [1930, 1990], [1850, 1910], [386000, 398000]),
  nrFdd(3, "DCS 1800", [1805, 1880], [1710, 1785], [361000, 376000]),
  nrFdd(5, "CLR 850", [869, 894], [824, 849], [173800, 178800]),
  nrFdd(7, "IMT-E 2600", [2620, 2690], [2500, 2570], [524000, 538000]),
  nrFdd(8, "GSM 900", [925, 960], [880, 915], [185000, 192000]),
  nrFdd(12, "Lower 700", [729, 746], [699, 716], [145800, 149200]),
  nrFdd(13, "Upper 700 c", [746, 756], [777, 787], [149200, 151200]),
  nrFdd(14, "FirstNet 700", [758, 768], [788, 798], [151600, 153600]),
  nrFdd(18, "Lower 800 (Japan)", [860, 875], [815, 830], [172000, 175000]),
  nrFdd(20, "EU 800 DD", [791, 821], [832, 862], [158200, 164200]),
  nrFdd(24, "L-Band 1600", [1525, 1559], [1626.5, 1660.5], [305000, 311800]),
  nrFdd(25, "PCS 1900+", [1930, 1995], [1850, 1915], [386000, 399000]),
  nrFdd(26, "ESMR 850+", [859, 894], [814, 849], [171800, 178800]),
  nrFdd(28, "APT 700", [758, 803], [703, 748], [151600, 160600]),
  nrFdd(30, "WCS 2300", [2350, 2360], [2305, 2315], [470000, 472000]),
  nrFdd(65, "IMT 2100+", [2110, 2200], [1920, 2010], [422000, 440000]),
  nrFdd(66, "AWS-3", [2110, 2200], [1710, 1780], [422000, 440000]),
  nrFdd(70, "AWS-4", [1995, 2020], [1695, 1710], [399000, 404000]),
  nrFdd(71, "600 MHz", [617, 652], [663, 698], [123400, 130400]),
  nrFdd(74, "L-Band 1500", [1475, 1518], [1427, 1470], [295000, 303600]),
  nrFdd(85, "Lower 700 a+", [728, 746], [698, 716], [145600, 149200]),
  nrFdd(100, "Railway 900", [919.4, 925], [874.4, 880], [183880, 185000]),
  nrFdd(105, "600 MHz+", [612, 652], [663, 703], [122400, 130400]),
  // SDL
  nrSdl(29, "SDL 700", [717, 728], [143400, 145600]),
  nrSdl(67, "EU 700 SDL", [738, 758], [147600, 151600]),
  nrSdl(75, "L-Band 1500 SDL", [1432, 1517], [286400, 303400]),
  nrSdl(76, "L-Band 1427 SDL", [1427, 1432], [285400, 286400]),
  // TDD (FR1)
  nrTdd(34, "IMT 2000 TDD", [2010, 2025], [402000, 405000]),
  nrTdd(38, "IMT-E 2600 TDD", [2570, 2620], [514000, 524000]),
  nrTdd(39, "DCS 1900 TDD", [1880, 1920], [376000, 384000]),
  nrTdd(40, "TD 2300", [2300, 2400], [460000, 480000]),
  nrTdd(41, "BRS/EBS", [2496, 2690], [499200, 537999]),
  nrTdd(46, "Unlicensed 5 GHz", [5150, 5925], [743334, 795000]),
  nrTdd(48, "CBRS", [3550, 3700], [636667, 646666]),
  nrTdd(50, "L-Band 1500 TDD", [1432, 1517], [286400, 303400]),
  nrTdd(51, "L-Band 1427 TDD", [1427, 1432], [285400, 286400]),
  nrTdd(53, "S-Band 2400", [2483.5, 2495], [496700, 499000]),
  nrTdd(77, "C-Band 3.3–4.2 GHz", [3300, 4200], [620000, 680000]),
  nrTdd(78, "C-Band 3.5 GHz", [3300, 3800], [620000, 653333]),
  nrTdd(79, "C-Band 4.5 GHz", [4400, 5000], [693334, 733333]),
  nrTdd(90, "BRS/EBS", [2496, 2690], [499200, 538000]),
  nrTdd(96, "Unlicensed 6 GHz", [5925, 7125], [795000, 875000]),
  nrTdd(101, "Railway 1900", [1900, 1910], [380000, 382000]),
  nrTdd(102, "Unlicensed 6 GHz lower", [5925, 6425], [795000, 828333]),
  nrTdd(104, "6.4–7.1 GHz", [6425, 7125], [828334, 875000]),
  // FR2 (mmWave), all TDD
  nrTdd(257, "mmWave 28 GHz", [26500, 29500], [2054166, 2104165]),
  nrTdd(258, "mmWave 26 GHz", [24250, 27500], [2016667, 2070832]),
  nrTdd(259, "mmWave 41 GHz", [39500, 43500], [2270833, 2337499]),
  nrTdd(260, "mmWave 39 GHz", [37000, 40000], [2229166, 2279165]),
  nrTdd(261, "mmWave 28 GHz (US)", [27500, 28350], [2070833, 2084999]),
  nrTdd(262, "mmWave 47 GHz", [47200, 48200], [2399166, 2415832]),
];

// --- Band Name Lookups -------------------------------------------------------

const NR_BAND_NAMES: Record<number, string> = {};
for (const b of NR_BANDS) {
  NR_BAND_NAMES[b.band] = b.name;
}

const LTE_BAND_NAMES: Record<number, string> = {};
for (const b of LTE_BANDS) {
  LTE_BAND_NAMES[b.band] = b.name;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Extract the numeric band number from a 3GPP band string.
 * e.g. "B3" → 3, "N41" → 41, "B66" → 66
 */
export function parseBandNumber(bandStr: string): number | null {
  const m = bandStr.match(/^[BNn]?(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Get the common/marketing name for a band.
 * @param bandStr - Band string, e.g. "B3" or "N41"
 * @param technology - "LTE" or "NR"
 * @returns Name like "DCS 1800" or "BRS/EBS", or empty string if unknown
 */
export function getBandName(bandStr: string, technology: "LTE" | "NR"): string {
  const num = parseBandNumber(bandStr);
  if (num === null) return "";
  if (technology === "NR") return NR_BAND_NAMES[num] ?? "";
  return LTE_BAND_NAMES[num] ?? "";
}

/** Rounds away floating point noise: 0.1 MHz LTE steps, 5 kHz NR steps. */
const round = (v: number, digits: number) => Number(v.toFixed(digits));

// --- LTE Frequency Calculations ----------------------------------------------

/** Find the matching LTE band entry for a given DL EARFCN */
function findLTEBand(earfcn: number): LTEBandEntry | null {
  for (const band of LTE_BANDS) {
    if (earfcn >= band.earfcnRange[0] && earfcn <= band.earfcnRange[1]) {
      return band;
    }
  }
  return null;
}

/**
 * Calculate the downlink frequency in MHz from an LTE EARFCN.
 * Formula: F_DL = F_DL_low + 0.1 × (EARFCN − N_Offs-DL)
 */
export function lteDLFrequency(earfcn: number): number | null {
  const band = findLTEBand(earfcn);
  if (!band) return null;
  return round(band.dlLow + (earfcn - band.earfcnOffset) * band.spacing, 1);
}

/**
 * Calculate the uplink frequency in MHz paired with an LTE DL EARFCN
 * (default duplex spacing). TDD: UL = DL. SDL, or a DL channel beyond the
 * band's UL range (B66, B70): null.
 */
export function lteULFrequency(earfcn: number): number | null {
  const band = findLTEBand(earfcn);
  if (!band) return null;
  const k = earfcn - band.earfcnOffset;
  if (band.duplexType === "SDL") return null;
  if (band.duplexType === "TDD") return round(band.dlLow + k * band.spacing, 1);
  const ul = band.ulEarfcnRange;
  if (ul && k > ul[1] - ul[0]) return null;
  return round(band.ulLow + k * band.spacing, 1);
}

/** Band edges (MHz): DL, and UL (TDD: the same; SDL: null). */
export function lteBandEdges(band: LTEBandEntry): {
  dl: [number, number];
  ul: [number, number] | null;
} {
  const width = (r: [number, number]) => (r[1] - r[0] + 1) * band.spacing;
  const dl: [number, number] = [band.dlLow, round(band.dlLow + width(band.earfcnRange), 1)];
  if (band.duplexType === "TDD") return { dl, ul: dl };
  if (band.duplexType === "SDL" || !band.ulEarfcnRange) return { dl, ul: null };
  return { dl, ul: [band.ulLow, round(band.ulLow + width(band.ulEarfcnRange), 1)] };
}

// --- NR Frequency Calculations -----------------------------------------------

/**
 * Calculate frequency in MHz from an NR-ARFCN using the global raster.
 * 3GPP TS 38.104 §5.4.2.1:
 *   Range 1 (0–599999):       F = 0          + 0.005 × N_REF
 *   Range 2 (600000–2016666): F = 3000       + 0.015 × (N_REF − 600000)
 *   Range 3 (2016667–3279165):F = 24250.08   + 0.060 × (N_REF − 2016667)
 */
export function nrArfcnToFrequency(nrarfcn: number): number | null {
  if (!Number.isInteger(nrarfcn)) return null;
  if (nrarfcn >= 0 && nrarfcn <= 599999) {
    return round(nrarfcn * 0.005, 3);
  } else if (nrarfcn >= 600000 && nrarfcn <= 2016666) {
    return round(3000 + (nrarfcn - 600000) * 0.015, 3);
  } else if (nrarfcn >= 2016667 && nrarfcn <= 3279165) {
    return round(24250.08 + (nrarfcn - 2016667) * 0.06, 3);
  }
  return null;
}

/** Nearest NR-ARFCN of a frequency (MHz) on the global raster. */
export function nrFrequencyToArfcn(freqMHz: number): number | null {
  if (!Number.isFinite(freqMHz) || freqMHz < 0) return null;
  if (freqMHz < 2999.9975) return Math.round(freqMHz / 0.005);
  if (freqMHz < 24250.05) return Math.min(2016666, Math.round(600000 + (freqMHz - 3000) / 0.015));
  const n = Math.round(2016667 + (freqMHz - 24250.08) / 0.06);
  return n <= 3279165 ? Math.max(2016667, n) : null;
}

/** Find the matching NR band entry for a given NR-ARFCN */
function findNRBand(nrarfcn: number): NRBandEntry | null {
  for (const band of NR_BANDS) {
    if (nrarfcn >= band.nrarfcnRange[0] && nrarfcn <= band.nrarfcnRange[1]) {
      return band;
    }
  }
  return null;
}

/**
 * Calculate the downlink frequency in MHz from an NR-ARFCN.
 */
export function nrDLFrequency(nrarfcn: number): number | null {
  return nrArfcnToFrequency(nrarfcn);
}

/**
 * Calculate the uplink frequency in MHz paired with an NR DL ARFCN.
 * For TDD: UL = DL (same frequency)
 * For FDD: compute offset from DL low edge, apply to UL low edge
 * For SDL, or beyond the band's UL range: null
 *
 * @param nrarfcn - NR-ARFCN value
 * @param bandNum - Optional band number to resolve ambiguous ARFCNs
 *   (e.g. 528030 matches both n7 FDD and n41 TDD)
 */
export function nrULFrequency(nrarfcn: number, bandNum?: number): number | null {
  let band: NRBandEntry | null = null;

  if (bandNum !== undefined) {
    // Use the specific band when provided (resolves overlap ambiguity)
    band = NR_BANDS.find((b) => b.band === bandNum) ?? null;
  }
  if (!band) {
    band = findNRBand(nrarfcn);
  }
  if (!band) return null;
  if (band.duplexType === "SDL") return null;

  const dlFreq = nrArfcnToFrequency(nrarfcn);
  if (dlFreq === null) return null;

  if (band.duplexType === "TDD") {
    // TDD: UL and DL share the same frequency
    return dlFreq;
  }
  // FDD: compute the offset from DL low, apply to UL low
  const ul = round(band.ulLow + (dlFreq - band.dlLow), 3);
  return ul <= band.ulHigh ? ul : null;
}

// --- Unified API (dispatches by technology) ----------------------------------

/**
 * Calculate the downlink frequency for a carrier component.
 * @param earfcn - EARFCN or NR-ARFCN value
 * @param technology - "LTE" or "NR"
 * @returns frequency in MHz, or null if not calculable
 */
export function getDLFrequency(
  earfcn: number | null,
  technology: "LTE" | "NR"
): number | null {
  if (earfcn === null || earfcn === undefined) return null;
  return technology === "NR" ? nrDLFrequency(earfcn) : lteDLFrequency(earfcn);
}

/**
 * Calculate the uplink frequency for a carrier component.
 * @param earfcn - EARFCN or NR-ARFCN value
 * @param technology - "LTE" or "NR"
 * @param bandStr - Optional band string (e.g. "B3", "N41") to resolve
 *   ambiguous NR-ARFCNs that fall in overlapping band ranges
 * @returns frequency in MHz, or null if not calculable (SDL bands, unknown EARFCN)
 */
export function getULFrequency(
  earfcn: number | null,
  technology: "LTE" | "NR",
  bandStr?: string
): number | null {
  if (earfcn === null || earfcn === undefined) return null;
  if (technology === "NR") {
    const bandNum = bandStr ? parseBandNumber(bandStr) : undefined;
    return nrULFrequency(earfcn, bandNum ?? undefined);
  }
  return lteULFrequency(earfcn);
}

/**
 * Get the duplex mode for a band.
 * @param bandStr - Band string, e.g. "B3" or "N41"
 * @param technology - "LTE" or "NR"
 * @returns "FDD", "TDD", "SDL", or "" if unknown
 */
export function getDuplexMode(
  bandStr: string,
  technology: "LTE" | "NR"
): string {
  const num = parseBandNumber(bandStr);
  if (num === null) return "";
  if (technology === "NR") {
    const band = NR_BANDS.find((b) => b.band === num);
    return band?.duplexType ?? "";
  }
  const band = LTE_BANDS.find((b) => b.band === num);
  return band?.duplexType ?? "";
}

/**
 * Format a frequency value for display.
 * e.g., 1850.5 → "1850.5 MHz", 28000.0 → "28.00 GHz"
 */
export function formatFrequency(freqMHz: number | null): string {
  if (freqMHz === null) return "-";
  if (freqMHz >= 10000) {
    return `${(freqMHz / 1000).toFixed(2)} GHz`;
  }
  const formatted = freqMHz % 1 === 0 ? freqMHz.toFixed(0) : freqMHz.toFixed(1);
  return `${formatted} MHz`;
}

// --- NR SCS Inference --------------------------------------------------------

/**
 * Suggest a default SCS (kHz) for a given NR band entry.
 *
 *   - FR1 FDD → 15 kHz
 *   - FR1 TDD → 30 kHz
 *   - FR2 (mmWave, dlLow >= 24250 MHz) → 60 kHz (user can override to 120)
 */
export function suggestNRSCS(band: NRBandEntry): number {
  if (band.dlLow >= 24250) return 60;
  if (band.duplexType === "FDD") return 15;
  return 30;
}

// --- Batch Matching ----------------------------------------------------------

/**
 * Find ALL LTE bands whose DL EARFCN range contains the given value.
 */
export function findAllMatchingLTEBands(earfcn: number): LTEBandEntry[] {
  return LTE_BANDS.filter(
    (b) => earfcn >= b.earfcnRange[0] && earfcn <= b.earfcnRange[1]
  );
}

/**
 * Find ALL NR bands whose DL NR-ARFCN range contains the given value.
 */
export function findAllMatchingNRBands(nrarfcn: number): NRBandEntry[] {
  return NR_BANDS.filter(
    (b) => nrarfcn >= b.nrarfcnRange[0] && nrarfcn <= b.nrarfcnRange[1]
  );
}

// =============================================================================
// Frequency calculator: channel → bands, frequency → channels
// =============================================================================

export type Rat = "LTE" | "NR";

export interface ChannelPoint {
  channel: number;
  /** MHz */
  freq: number;
}

/** One band a channel or a frequency belongs to. */
export interface BandMatch {
  rat: Rat;
  band: number;
  /** "B3", "n78" */
  label: string;
  name: string;
  duplex: "FDD" | "TDD" | "SDL";
  /** Side of the band the input falls in; TDD bands use one for both */
  direction: "DL" | "UL" | "TDD";
  dl: ChannelPoint | null;
  /** Paired UL (FDD: default duplex spacing; TDD: same as DL) */
  ul: ChannelPoint | null;
  dlEdges: [number, number];
  ulEdges: [number, number] | null;
  dlChannels: [number, number];
  ulChannels: [number, number] | null;
  /** UL to DL spacing (MHz), FDD only */
  duplexSpacing: number | null;
}

function lteMatch(b: LTEBandEntry, k: number, direction: BandMatch["direction"]): BandMatch {
  const edges = lteBandEdges(b);
  const dl = { channel: b.earfcnRange[0] + k, freq: round(b.dlLow + k * b.spacing, 1) };
  let ul: ChannelPoint | null = null;
  if (b.duplexType === "TDD") ul = dl;
  else if (b.duplexType === "FDD" && b.ulEarfcnRange && k <= b.ulEarfcnRange[1] - b.ulEarfcnRange[0]) {
    ul = { channel: b.ulEarfcnRange[0] + k, freq: round(b.ulLow + k * b.spacing, 1) };
  }
  return {
    rat: "LTE",
    band: b.band,
    label: `B${b.band}`,
    name: b.name,
    duplex: b.duplexType,
    direction,
    dl: direction === "UL" && k > b.earfcnRange[1] - b.earfcnRange[0] ? null : dl,
    ul,
    dlEdges: edges.dl,
    ulEdges: edges.ul,
    dlChannels: b.earfcnRange,
    ulChannels: b.duplexType === "TDD" ? b.earfcnRange : (b.ulEarfcnRange ?? null),
    duplexSpacing: b.duplexType === "FDD" ? round(b.dlLow - b.ulLow, 1) : null,
  };
}

/** LTE bands of an EARFCN: as a DL channel, or as an FDD UL channel. */
export function lteChannelMatches(earfcn: number): BandMatch[] {
  if (!Number.isInteger(earfcn) || earfcn < 0) return [];
  const out: BandMatch[] = [];
  for (const b of LTE_BANDS) {
    if (earfcn >= b.earfcnRange[0] && earfcn <= b.earfcnRange[1]) {
      out.push(lteMatch(b, earfcn - b.earfcnRange[0], b.duplexType === "TDD" ? "TDD" : "DL"));
    }
    const ul = b.ulEarfcnRange;
    if (b.duplexType === "FDD" && ul && earfcn >= ul[0] && earfcn <= ul[1]) {
      out.push(lteMatch(b, earfcn - ul[0], "UL"));
    }
  }
  return out;
}

/** LTE channels of a frequency (MHz): nearest 100 kHz raster point per band. */
export function lteFrequencyMatches(freqMHz: number): BandMatch[] {
  if (!Number.isFinite(freqMHz)) return [];
  const out: BandMatch[] = [];
  for (const b of LTE_BANDS) {
    const dlCount = b.earfcnRange[1] - b.earfcnRange[0];
    const kDl = Math.round((freqMHz - b.dlLow) / b.spacing);
    if (kDl >= 0 && kDl <= dlCount) {
      out.push(lteMatch(b, kDl, b.duplexType === "TDD" ? "TDD" : "DL"));
    }
    const ul = b.ulEarfcnRange;
    if (b.duplexType === "FDD" && ul) {
      const kUl = Math.round((freqMHz - b.ulLow) / b.spacing);
      if (kUl >= 0 && kUl <= ul[1] - ul[0]) out.push(lteMatch(b, kUl, "UL"));
    }
  }
  return out;
}

function nrMatch(b: NRBandEntry, at: ChannelPoint, direction: BandMatch["direction"]): BandMatch {
  const point = (f: number): ChannelPoint | null => {
    const channel = nrFrequencyToArfcn(f);
    return channel === null ? null : { channel, freq: nrArfcnToFrequency(channel) ?? f };
  };
  let dl: ChannelPoint | null = null;
  let ul: ChannelPoint | null = null;
  if (b.duplexType === "TDD") {
    dl = at;
    ul = at;
  } else if (direction === "UL") {
    ul = at;
    const f = round(b.dlLow + (at.freq - b.ulLow), 3);
    dl = f <= b.dlHigh ? point(f) : null;
  } else {
    dl = at;
    if (b.duplexType === "FDD") {
      const f = round(b.ulLow + (at.freq - b.dlLow), 3);
      ul = f <= b.ulHigh ? point(f) : null;
    }
  }
  const ulEdges: [number, number] | null = b.duplexType === "SDL" ? null : [b.ulLow, b.ulHigh];
  return {
    rat: "NR",
    band: b.band,
    label: `n${b.band}`,
    name: b.name,
    duplex: b.duplexType,
    direction,
    dl,
    ul,
    dlEdges: [b.dlLow, b.dlHigh],
    ulEdges,
    dlChannels: b.nrarfcnRange,
    ulChannels:
      b.duplexType === "TDD"
        ? b.nrarfcnRange
        : ulEdges
          ? [nrFrequencyToArfcn(ulEdges[0])!, nrFrequencyToArfcn(ulEdges[1])!]
          : null,
    duplexSpacing: b.duplexType === "FDD" ? round(b.dlLow - b.ulLow, 3) : null,
  };
}

/** NR bands of an NR-ARFCN: DL (or TDD) range, or the UL range of FDD bands. */
export function nrChannelMatches(nrarfcn: number): BandMatch[] {
  const freq = nrArfcnToFrequency(nrarfcn);
  if (freq === null) return [];
  const at = { channel: nrarfcn, freq };
  const out: BandMatch[] = [];
  for (const b of NR_BANDS) {
    if (nrarfcn >= b.nrarfcnRange[0] && nrarfcn <= b.nrarfcnRange[1]) {
      out.push(nrMatch(b, at, b.duplexType === "TDD" ? "TDD" : "DL"));
    }
    if (b.duplexType === "FDD" && freq >= b.ulLow && freq <= b.ulHigh) {
      out.push(nrMatch(b, at, "UL"));
    }
  }
  return out;
}

export interface CalcResult {
  rat: Rat;
  /** The channel the input names, or the nearest raster point of a frequency */
  channel: number;
  /** MHz of that channel */
  freq: number | null;
  matches: BandMatch[];
}

const MAX_LTE_EARFCN = Math.max(
  ...LTE_BANDS.map((b) => (b.ulEarfcnRange ?? b.earfcnRange)[1]),
);

/**
 * Bands of a channel number. "auto" reads it as an LTE DL EARFCN, then an
 * NR-ARFCN, then an LTE UL EARFCN, in that order.
 */
export function calculateChannel(channel: number, rat: Rat | "auto"): CalcResult {
  const lte = (): CalcResult => {
    const matches = lteChannelMatches(channel);
    const m = matches[0];
    const freq = m ? (m.direction === "UL" ? m.ul?.freq : m.dl?.freq) ?? null : null;
    return { rat: "LTE", channel, freq, matches };
  };
  const nr = (): CalcResult => ({
    rat: "NR",
    channel,
    freq: nrArfcnToFrequency(channel),
    matches: nrChannelMatches(channel),
  });
  if (rat === "LTE") return lte();
  if (rat === "NR") return nr();
  const l = lte();
  if (l.matches.some((m) => m.direction !== "UL")) return l;
  const n = nr();
  if (n.matches.some((m) => m.direction !== "UL")) return n;
  if (l.matches.length) return l;
  if (n.matches.length) return n;
  return channel <= MAX_LTE_EARFCN ? l : n;
}

/** Channels of a frequency (MHz), per RAT; "auto" gives both. */
export function calculateFrequency(freqMHz: number, rat: Rat | "auto"): CalcResult[] {
  const out: CalcResult[] = [];
  if (rat !== "NR") {
    const matches = lteFrequencyMatches(freqMHz);
    const m = matches[0];
    const point = m ? (m.direction === "UL" ? m.ul : m.dl) : null;
    if (matches.length || rat === "LTE") {
      out.push({ rat: "LTE", channel: point?.channel ?? NaN, freq: point?.freq ?? null, matches });
    }
  }
  if (rat !== "LTE") {
    const channel = nrFrequencyToArfcn(freqMHz);
    const matches = channel === null ? [] : nrChannelMatches(channel);
    if (channel !== null && (matches.length || rat === "NR")) {
      out.push({ rat: "NR", channel, freq: nrArfcnToFrequency(channel), matches });
    }
  }
  return out;
}
