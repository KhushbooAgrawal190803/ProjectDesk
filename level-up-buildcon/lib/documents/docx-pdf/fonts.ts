import { readFile } from 'fs/promises'
import path from 'path'
import fontkit from '@pdf-lib/fontkit'
import { DocxRenderError, type RunStyle } from '@/lib/documents/docx-pdf/model'

/**
 * The fonts the PDF is set in. The master asks for Calibri, Tahoma and Bookman
 * Old Style, which cannot be shipped. Each is replaced the way LibreOffice
 * replaces it, so the PDF reads the same as the office renderer's:
 * Calibri by Carlito (same widths), Tahoma and Bookman Old Style by Linux
 * Libertine G, and bold Tahoma or Bookman by Frank Ruhl Hofshi Bold.
 */

export type FaceKey = 'carlito' | 'carlito-bold' | 'carlito-italic' | 'carlito-bold-italic' | 'libertine' | 'frank-ruhl-bold'

const NAMES: Record<FaceKey, string> = {
  carlito: 'Carlito-Regular.ttf',
  'carlito-bold': 'Carlito-Bold.ttf',
  'carlito-italic': 'Carlito-Italic.ttf',
  'carlito-bold-italic': 'Carlito-BoldItalic.ttf',
  libertine: 'LinLibertine_R_G.ttf',
  'frank-ruhl-bold': 'FrankRuhlHofshi-Bold.otf',
}

// Each read is written out in full so the deployment bundles exactly these files.
const READS: Record<FaceKey, () => Promise<Buffer>> = {
  carlito: () => readFile(path.join(process.cwd(), 'assets/fonts/Carlito-Regular.ttf')),
  'carlito-bold': () => readFile(path.join(process.cwd(), 'assets/fonts/Carlito-Bold.ttf')),
  'carlito-italic': () => readFile(path.join(process.cwd(), 'assets/fonts/Carlito-Italic.ttf')),
  'carlito-bold-italic': () => readFile(path.join(process.cwd(), 'assets/fonts/Carlito-BoldItalic.ttf')),
  libertine: () => readFile(path.join(process.cwd(), 'assets/fonts/LinLibertine_R_G.ttf')),
  'frank-ruhl-bold': () => readFile(path.join(process.cwd(), 'assets/fonts/FrankRuhlHofshi-Bold.otf')),
}

export interface Face {
  key: FaceKey
  bytes: Uint8Array
  /** CFF outlines are embedded whole; TrueType outlines are subset. */
  subset: boolean
  unitsPerEm: number
  ascent: number
  descent: number
  lineGap: number
  underlinePosition: number
  underlineThickness: number
  has(codePoint: number): boolean
  advance(codePoint: number): number
  /** Width of a run of text in font units, with the font's standard ligatures. */
  width(text: string): number
}

/** Standard ligatures on and kerning off: what LibreOffice applies to the master. */
export const FEATURES = { kern: false }

const loaded = new Map<FaceKey, Promise<Face>>()

async function loadFace(key: FaceKey): Promise<Face> {
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await READS[key]())
  } catch {
    throw new DocxRenderError(`The PDF font ${NAMES[key]} is missing from assets/fonts.`)
  }
  const font = fontkit.create(bytes)
  const widths = new Map<number, number>()
  const runs = new Map<string, number>()
  return {
    key,
    bytes,
    subset: !NAMES[key].endsWith('.otf'),
    unitsPerEm: font.unitsPerEm,
    ascent: font.ascent,
    descent: Math.abs(font.descent),
    lineGap: font.lineGap,
    underlinePosition: font.underlinePosition,
    underlineThickness: font.underlineThickness,
    has: (codePoint) => font.hasGlyphForCodePoint(codePoint),
    advance: (codePoint) => {
      let width = widths.get(codePoint)
      if (width == null) {
        width = font.glyphForCodePoint(codePoint).advanceWidth
        widths.set(codePoint, width)
      }
      return width
    },
    width: (text) => {
      let width = runs.get(text)
      if (width == null) {
        width = font.layout(text, FEATURES).advanceWidth
        if (runs.size < 20000) runs.set(text, width)
      }
      return width
    },
  }
}

export function face(key: FaceKey): Promise<Face> {
  let pending = loaded.get(key)
  if (!pending) {
    pending = loadFace(key)
    pending.catch(() => loaded.delete(key))
    loaded.set(key, pending)
  }
  return pending
}

export function faceKey(style: RunStyle): FaceKey {
  const family = style.font.trim().toLowerCase()
  if (family === 'tahoma' || family === 'bookman old style') {
    if (style.bold) return 'frank-ruhl-bold'
    if (style.italic) throw new DocxRenderError(`Italic ${style.font} text is not supported in the agreement PDF.`)
    return 'libertine'
  }
  // Calibri, and any other family the master names, is set in Carlito.
  if (style.bold && style.italic) return 'carlito-bold-italic'
  if (style.bold) return 'carlito-bold'
  if (style.italic) return 'carlito-italic'
  return 'carlito'
}

export const ALL_FACES = Object.keys(NAMES) as FaceKey[]

/** Every face, loaded once per process. */
export async function loadFaces(): Promise<Record<FaceKey, Face>> {
  const faces = await Promise.all(ALL_FACES.map((key) => face(key)))
  return Object.fromEntries(faces.map((item) => [item.key, item])) as Record<FaceKey, Face>
}
