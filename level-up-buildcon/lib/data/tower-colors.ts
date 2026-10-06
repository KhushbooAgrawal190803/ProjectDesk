/** Muted but distinguishable tower palette — not neon primaries. */
export const TOWER = {
  developer: {
    cell: 'bg-[#8ecfb0] border-[#3a9470] text-[#0f4d32]',
    swatch: 'bg-[#8ecfb0] border-[#3a9470]',
  },
  landowner: {
    cell: 'bg-[#94b8e0] border-[#4a7fb5] text-[#1a3f66]',
    swatch: 'bg-[#94b8e0] border-[#4a7fb5]',
  },
  commercial: {
    cell: 'bg-[#d9bf94] border-[#a08050] text-[#5c4528]',
    swatch: 'bg-[#d9bf94] border-[#a08050]',
  },
  amenity: {
    cell: 'bg-[#b8bcc4] border-[#7a828c] text-[#3f4650]',
    swatch: 'bg-[#b8bcc4] border-[#7a828c]',
  },
  sold: {
    ring: 'ring-2 ring-[#c94848] ring-offset-1 shadow-sm',
    swatchRing: 'ring-2 ring-[#c94848]',
  },
} as const
