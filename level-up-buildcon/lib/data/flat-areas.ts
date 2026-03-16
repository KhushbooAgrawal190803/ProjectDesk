/**
 * Anandam project: Flat number → Built-up Area (sq.ft.) and Super Built-up Area (sq.ft.)
 * Source: project schedule. AMENITY units (e.g. 105, 106) have no residential area.
 */

export interface FlatArea {
  built_up_area_sqft: number | null  // TOTAL BUILT-UP AREA (SFT); null = AMENITY
  super_built_up_area_sqft: number | null  // TOTAL SUPER BUILT-UP AREA (SFT); null = AMENITY
}

// Flats 105, 106 are AMENITY
const AMENITY: FlatArea = { built_up_area_sqft: null, super_built_up_area_sqft: null }

// Pattern by last two digits (x01..x08). Keys are string "01".."08".
const PATTERN: Record<string, { built: number; super: number }> = {
  '01': { built: 1387.1, super: 1803 },
  '02': { built: 1379.9, super: 1794 },
  '03': { built: 1271.7, super: 1653 },
  '04': { built: 1538.3, super: 2000 },
  '05': { built: 1178.5, super: 1532 },
  '06': { built: 1175.7, super: 1528 },
  '07': { built: 1274.5, super: 1657 },
  '08': { built: 1538.3, super: 2000 },
}

// Overrides for specific flat numbers (from schedule)
const OVERRIDES: Record<string, FlatArea> = {
  '105': AMENITY,
  '106': AMENITY,
  '107': { built_up_area_sqft: 1271.7, super_built_up_area_sqft: 1653 },
  '108': { built_up_area_sqft: 1538.3, super_built_up_area_sqft: 2000 },
  '205': { built_up_area_sqft: 1178.5, super_built_up_area_sqft: 1532 },
  '206': { built_up_area_sqft: 1175.7, super_built_up_area_sqft: 1528 },
  '207': { built_up_area_sqft: 1274.5, super_built_up_area_sqft: 1657 },
  '208': { built_up_area_sqft: 1538.3, super_built_up_area_sqft: 2000 },
  '304': { built_up_area_sqft: 1534.8, super_built_up_area_sqft: 1995 },
  '305': { built_up_area_sqft: 1174.1, super_built_up_area_sqft: 1526 },
  '307': { built_up_area_sqft: 1271.7, super_built_up_area_sqft: 1653 },
  '405': { built_up_area_sqft: 1178.5, super_built_up_area_sqft: 1532 },
  '505': { built_up_area_sqft: 1174.1, super_built_up_area_sqft: 1526 },
  '507': { built_up_area_sqft: 1274.5, super_built_up_area_sqft: 1657 },
  '705': { built_up_area_sqft: 1174.1, super_built_up_area_sqft: 1526 },
  '707': { built_up_area_sqft: 1274.5, super_built_up_area_sqft: 1657 },
  '805': { built_up_area_sqft: 1174.1, super_built_up_area_sqft: 1526 },
  '807': { built_up_area_sqft: 1274.5, super_built_up_area_sqft: 1657 },
  '905': { built_up_area_sqft: 1174.1, super_built_up_area_sqft: 1526 },
  '907': { built_up_area_sqft: 1271.7, super_built_up_area_sqft: 1653 },
  '1007': { built_up_area_sqft: 1274.5, super_built_up_area_sqft: 1657 },
}

const PROJECT_NAME_FOR_LOOKUP = 'Anandam'

/**
 * Get built-up and super built-up area for a flat in Anandam project.
 * Returns null if flat not in schedule or project is not Anandam.
 */
export function getFlatAreas(projectName: string, unitNo: string): FlatArea | null {
  if (!projectName || !unitNo) return null
  const normalizedProject = projectName.trim()
  if (normalizedProject !== PROJECT_NAME_FOR_LOOKUP) return null

  const flat = String(unitNo).trim()
  if (OVERRIDES[flat]) return OVERRIDES[flat]

  // Floors 1–10: 301-308, 401-408, ..., 1001-1008 (last two digits = unit suffix)
  const match = flat.match(/^(\d{1,2})(\d{2})$/)
  if (match) {
    const floor = parseInt(match[1], 10)
    const suffix = match[2]
    if (floor >= 1 && floor <= 10 && PATTERN[suffix]) {
      const p = PATTERN[suffix]
      return { built_up_area_sqft: p.built, super_built_up_area_sqft: p.super }
    }
  }

  return null
}

/** Whether this project uses the flat-area lookup (e.g. Anandam). */
export function isFlatAreaLookupProject(projectName: string): boolean {
  return projectName?.trim() === PROJECT_NAME_FOR_LOOKUP
}
