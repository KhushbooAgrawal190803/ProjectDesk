/** Unit boundaries from "flat direction details _dictatedby ravibhaiya.xls". The previous spreadsheet is not used. */

export interface UnitBoundaries {
  east: string
  west: string
  north: string
  south: string
}

export type BoundaryMatch =
  | { state: 'empty' }
  | { state: 'found'; boundaries: UnitBoundaries }
  | { state: 'missing' }
  | { state: 'ambiguous' }

const BOUNDARIES: Record<string, UnitBoundaries> = {
  "107": { east: "Open space of anandam", west: "Flat no. 108", north: "Indoor play area", south: "Open space of anandam" },
  "108": { east: "Flat no. 107", west: "Open space of anandam", north: "Gymnasium", south: "Open space of anandam" },
  "205": { east: "Flat no. 206", west: "Open space of anandam", north: "Community hall", south: "flat no. 208" },
  "206": { east: "Open space of anandam", west: "Flat no. 205", north: "Open space of anandam", south: "Flat no. 207" },
  "207": { east: "Open space of anandam", west: "Flat no. 208", north: "Flat no. 206", south: "Open space of anandam" },
  "208": { east: "Flat no. 207", west: "Open space of anandam", north: "Flat no. 205", south: "Open space of anandam" },
  "301": { east: "Flat no. 302", west: "Open space of anandam", north: "Daladali-Road", south: "Flat no. 304" },
  "302": { east: "Open space of anandam", west: "Flat no. 301", north: "Daladali-Road", south: "Flat no. 303" },
  "303": { east: "Open space of anandam", west: "Flat no. 304", north: "Flat no. 302", south: "Open space of anandam" },
  "304": { east: "Flat no.303", west: "Open space of anandam", north: "Flat no. 301", south: "Community hall" },
  "305": { east: "Flat no. 306", west: "Open space of anandam", north: "Community hall", south: "Flat no. 308" },
  "306": { east: "Open space of anandam", west: "Flat no. 305", north: "Open space of anandam", south: "Flat no. 307" },
  "307": { east: "Open space of anandam", west: "Flat no. 308", north: "Flat no. 306", south: "Open space of anandam" },
  "308": { east: "Flat no. 307", west: "Open space of anandam", north: "Flat no. 305", south: "Open space of anandam" },
  "401": { east: "Flat no. 402", west: "Open space of anandam", north: "Daladali-Road", south: "Flat no. 404" },
  "402": { east: "Open space of anandam", west: "Flat no. 401", north: "Daladali-Road", south: "Flat no. 403" },
  "403": { east: "Open space of anandam", west: "Flat no. 404", north: "Flat no. 402", south: "Open space of anandam" },
  "404": { east: "Flat no.403", west: "Open space of anandam", north: "Flat no. 401", south: "Community hall" },
  "405": { east: "Flat no. 406", west: "Open space of anandam", north: "Community hall", south: "Flat no. 408" },
  "406": { east: "Open space of anandam", west: "Flat no. 405", north: "Open space of anandam", south: "Flat no. 407" },
  "407": { east: "Open space of anandam", west: "Flat no. 408", north: "Flat no. 406", south: "Open space of anandam" },
  "408": { east: "Flat no. 407", west: "Open space of anandam", north: "Flat no. 405", south: "Open space of anandam" },
  "501": { east: "Flat no. 502", west: "Open space of anandam", north: "Daladali-Road", south: "Flat no. 504" },
  "502": { east: "Open space of anandam", west: "Flat no. 501", north: "Daladali-Road", south: "Flat no. 503" },
  "503": { east: "Open space of anandam", west: "Flat no. 504", north: "Flat no. 502", south: "Open space of anandam" },
  "504": { east: "Flat no.503", west: "Open space of anandam", north: "Flat no. 501", south: "Community hall" },
  "505": { east: "Flat no. 506", west: "Open space of anandam", north: "Community hall", south: "Flat no. 508" },
  "506": { east: "Open space of anandam", west: "Flat no. 505", north: "Open space of anandam", south: "Flat no. 507" },
  "507": { east: "Open space of anandam", west: "Flat no. 508", north: "Flat no. 506", south: "Open space of anandam" },
  "508": { east: "Flat no. 507", west: "Open space of anandam", north: "Flat no. 505", south: "Open space of anandam" },
  "601": { east: "Flat no. 602", west: "Open space of anandam", north: "Daladali-Road", south: "Flat no. 604" },
  "602": { east: "Open space of anandam", west: "Flat no. 601", north: "Daladali-Road", south: "Flat no. 603" },
  "603": { east: "Open space of anandam", west: "Flat no. 604", north: "Flat no. 602", south: "Open space of anandam" },
  "604": { east: "Flat no.603", west: "Open space of anandam", north: "Flat no. 601", south: "Community hall" },
  "605": { east: "Flat no. 606", west: "Open space of anandam", north: "Community hall", south: "Flat no. 608" },
  "606": { east: "Open space of anandam", west: "Flat no. 605", north: "Open space of anandam", south: "Flat no. 607" },
  "607": { east: "Open space of anandam", west: "Flat no. 608", north: "Flat no. 606", south: "Open space of anandam" },
  "608": { east: "Flat no. 607", west: "Open space of anandam", north: "Flat no. 605", south: "Open space of anandam" },
  "701": { east: "Flat no. 702", west: "Open space of anandam", north: "Daladali-Road", south: "Flat no. 704" },
  "702": { east: "Open space of anandam", west: "Flat no. 701", north: "Daladali-Road", south: "Flat no. 703" },
  "703": { east: "Open space of anandam", west: "Flat no. 704", north: "Flat no. 702", south: "Open space of anandam" },
  "704": { east: "Flat no.703", west: "Open space of anandam", north: "Flat no. 701", south: "Community hall" },
  "705": { east: "Flat no. 706", west: "Open space of anandam", north: "Community hall", south: "Flat no. 708" },
  "706": { east: "Open space of anandam", west: "Flat no. 705", north: "Open space of anandam", south: "Flat no. 707" },
  "707": { east: "Open space of anandam", west: "Flat no. 708", north: "Flat no. 706", south: "Open space of anandam" },
  "708": { east: "Flat no. 707", west: "Open space of anandam", north: "Flat no. 705", south: "Open space of anandam" },
  "801": { east: "Flat no. 802", west: "Open space of anandam", north: "Daladali-Road", south: "Flat no. 804" },
  "802": { east: "Open space of anandam", west: "Flat no. 801", north: "Daladali-Road", south: "Flat no. 803" },
  "803": { east: "Open space of anandam", west: "Flat no. 804", north: "Flat no. 802", south: "Open space of anandam" },
  "804": { east: "Flat no.803", west: "Open space of anandam", north: "Flat no. 801", south: "Community hall" },
  "805": { east: "Flat no. 806", west: "Open space of anandam", north: "Community hall", south: "Flat no. 808" },
  "806": { east: "Open space of anandam", west: "Flat no. 805", north: "Open space of anandam", south: "Flat no. 807" },
  "807": { east: "Open space of anandam", west: "Flat no. 808", north: "Flat no. 806", south: "Open space of anandam" },
  "808": { east: "Flat no. 807", west: "Open space of anandam", north: "Flat no. 805", south: "Open space of anandam" },
  "901": { east: "Flat no. 902", west: "Open space of anandam", north: "Daladali-Road", south: "Flat no. 904" },
  "902": { east: "Open space of anandam", west: "Flat no. 901", north: "Daladali-Road", south: "Flat no. 903" },
  "903": { east: "Open space of anandam", west: "Flat no. 904", north: "Flat no. 902", south: "Open space of anandam" },
  "904": { east: "Flat no.903", west: "Open space of anandam", north: "Flat no. 901", south: "Community hall" },
  "905": { east: "Flat no. 906", west: "Open space of anandam", north: "Community hall", south: "Flat no. 908" },
  "906": { east: "Open space of anandam", west: "Flat no. 905", north: "Open space of anandam", south: "Flat no. 907" },
  "907": { east: "Open space of anandam", west: "Flat no. 908", north: "Flat no. 906", south: "Open space of anandam" },
  "908": { east: "Flat no. 907", west: "Open space of anandam", north: "Flat no. 905", south: "Open space of anandam" },
  "1001": { east: "Flat no. 1002", west: "Open space of anandam", north: "Daladali-Road", south: "Flat no. 1004" },
  "1002": { east: "Open space of anandam", west: "Flat no. 1001", north: "Daladali-Road", south: "Flat no. 1003" },
  "1003": { east: "Open space of anandam", west: "Flat no. 1004", north: "Flat no. 1002", south: "Open space of anandam" },
  "1004": { east: "Flat no.1003", west: "Open space of anandam", north: "Flat no. 1001", south: "Community hall" },
  "1005": { east: "Flat no. 1006", west: "Open space of anandam", north: "Community hall", south: "Flat no. 1008" },
  "1006": { east: "Open space of anandam", west: "Flat no. 1005", north: "Open space of anandam", south: "Flat no. 1007" },
  "1007": { east: "Open space of anandam", west: "Flat no. 1008", north: "Flat no. 1006", south: "Open space of anandam" },
  "1008": { east: "Flat no. 1007", west: "Open space of anandam", north: "Flat no. 1005", south: "Open space of anandam" },
}

const AMBIGUOUS = new Set<string>([])

export function boundaryMatch(unitNo: string | null | undefined): BoundaryMatch {
  if (!unitNo || !String(unitNo).trim()) return { state: 'empty' }
  const unit = String(unitNo).trim()
  if (AMBIGUOUS.has(unit)) return { state: 'ambiguous' }
  const boundaries = BOUNDARIES[unit]
  if (!boundaries) return { state: 'missing' }
  return { state: 'found', boundaries }
}

export function getUnitBoundaries(unitNo: string | null | undefined): UnitBoundaries | null {
  const match = boundaryMatch(unitNo)
  return match.state === 'found' ? match.boundaries : null
}
