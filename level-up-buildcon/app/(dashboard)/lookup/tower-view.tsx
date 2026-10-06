'use client'

import { Fragment, useState, useTransition } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getAllKnownFlats, isAmenityFlat, isCommercialFlat } from '@/lib/data/flat-areas'
import { getOwnerTypeForFlat, OWNER_NAMES } from '@/lib/data/flat-ownership'
import { TOWER } from '@/lib/data/tower-colors'
import { getTowerAllocations, AllocatedUnit } from './tower-actions'
import { cn } from '@/lib/utils'

const FLOORS = 10
const UNITS_PER_FLOOR = 8
const PROJECT = 'Anandam'

const ALL_FLATS = getAllKnownFlats(PROJECT)

type FlatStatus = 'available' | 'allocated' | 'amenity' | 'commercial'

interface FlatCell {
  unitNo: string
  floor: number
  unit: number
  status: FlatStatus
  allocation?: AllocatedUnit
}

function buildGrid(allocations: AllocatedUnit[]): FlatCell[][] {
  const allocMap = new Map(allocations.map(a => [a.unit_no, a]))

  const rows: FlatCell[][] = []
  for (let floor = FLOORS; floor >= 1; floor--) {
    const row: FlatCell[] = []
    for (let unit = 1; unit <= UNITS_PER_FLOOR; unit++) {
      const unitNo = `${floor}${String(unit).padStart(2, '0')}`
      const amenity = isAmenityFlat(unitNo)
      const commercial = isCommercialFlat(unitNo)
      const allocation = allocMap.get(unitNo)
      let status: FlatStatus = 'available'
      if (amenity) status = 'amenity'
      else if (allocation) status = 'allocated'
      else if (commercial) status = 'commercial'
      row.push({ unitNo, floor, unit, status, allocation })
    }
    rows.push(row)
  }
  return rows
}

function flatCellStyle(cell: FlatCell): string {
  if (cell.status === 'amenity') return TOWER.amenity.cell
  if (cell.status === 'commercial') return TOWER.commercial.cell
  const owner = getOwnerTypeForFlat(cell.unitNo)
  return owner === 'LANDOWNER' ? TOWER.landowner.cell : TOWER.developer.cell
}

interface TowerViewProps {
  initialAllocations: AllocatedUnit[]
  showHeader?: boolean
  size?: 'default' | 'large'
}

export function TowerView({ initialAllocations, showHeader = true, size = 'default' }: TowerViewProps) {
  const [allocations, setAllocations] = useState(initialAllocations)
  const [isPending, startTransition] = useTransition()
  const [tooltip, setTooltip] = useState<{ unitNo: string; x: number; y: number } | null>(null)

  const isLarge = size === 'large'
  const cellW = isLarge ? 'w-[4.75rem] sm:w-[5.25rem]' : 'w-16'
  const cellH = isLarge ? 'h-[4.25rem] sm:h-[4.75rem]' : 'h-14'
  const floorW = isLarge ? 'w-24' : 'w-20'

  const refresh = () => {
    startTransition(async () => {
      const fresh = await getTowerAllocations()
      setAllocations(fresh)
    })
  }

  const grid = buildGrid(allocations)
  const totalAllocated = allocations.length
  const totalAmenity = ALL_FLATS.filter(f => isAmenityFlat(f)).length
  const totalCommercial = ALL_FLATS.filter(f => isCommercialFlat(f)).length
  const totalAvailable = ALL_FLATS.length - totalAmenity - totalCommercial - totalAllocated

  const summary = `${totalAllocated} sold · ${totalAvailable} available · ${totalCommercial} commercial · ${totalAmenity} amenity`

  return (
    <div className={cn('flex flex-col', isLarge && 'min-h-0 flex-1')}>
      <div className="mb-4 flex shrink-0 items-start justify-between gap-4">
        {showHeader ? (
          <div>
            <h2 className="text-xl font-semibold text-zinc-900">Anandam — Tower View</h2>
            <p className="mt-0.5 text-sm text-zinc-500">{summary}</p>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">{summary}</p>
        )}
        <Button variant="outline" size="sm" onClick={refresh} disabled={isPending} className="shrink-0 gap-2">
          <RefreshCw className={cn('size-4', isPending && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Legend */}
      <div className="mb-5 flex shrink-0 flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm">
        <div className="flex items-center gap-2">
          <div className={cn('size-5 rounded border-2', TOWER.developer.swatch)} />
          <span className="font-medium text-zinc-700">{OWNER_NAMES.DEVELOPER}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn('size-5 rounded border-2', TOWER.landowner.swatch)} />
          <span className="font-medium text-zinc-700">{OWNER_NAMES.LANDOWNER}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn('size-5 rounded border-2', TOWER.developer.swatch, TOWER.sold.swatchRing)} />
          <span className="font-medium text-zinc-700">Sold</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn('size-5 rounded border-2', TOWER.commercial.swatch)} />
          <span className="font-medium text-zinc-700">Commercial</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn('size-5 rounded border-2', TOWER.amenity.swatch)} />
          <span className="font-medium text-zinc-700">Amenity</span>
        </div>
      </div>

      {/* Tower grid — centered, scrolls horizontally on small screens */}
      <div className={cn('flex flex-1 items-start justify-center overflow-x-auto', isLarge && 'pb-2')}>
        <div className="inline-block min-w-max">
          <div className={cn('mb-1.5 flex items-center', isLarge ? 'ml-24' : 'ml-20')}>
            {Array.from({ length: UNITS_PER_FLOOR }, (_, i) => (
              <Fragment key={i}>
                {i === 4 && <div className="w-6 shrink-0" />}
                <div className={cn(cellW, 'text-center text-xs font-medium text-zinc-400')}>
                  {String(i + 1).padStart(2, '0')}
                </div>
              </Fragment>
            ))}
          </div>

          {grid.map((row, rowIdx) => {
            const floor = FLOORS - rowIdx
            return (
              <div key={floor} className="mb-1.5 flex items-center">
                <div className={cn(floorW, 'shrink-0 pr-3 text-right text-sm font-semibold text-zinc-500')}>
                  F{floor}
                </div>

                {row.map((cell, cellIdx) => {
                  const baseStyle = flatCellStyle(cell)
                  const soldRing = cell.status === 'allocated' ? TOWER.sold.ring : ''
                  const inner = (
                    <div
                      className={cn(
                        'mx-0.5 flex flex-col items-center justify-center rounded-lg border-2 select-none transition-all',
                        cellW,
                        cellH,
                        baseStyle,
                        soldRing,
                        cell.status === 'allocated' && 'cursor-pointer hover:brightness-95'
                      )}
                      onMouseEnter={
                        cell.status === 'allocated'
                          ? (e) => {
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                              setTooltip({ unitNo: cell.unitNo, x: rect.left, y: rect.top })
                            }
                          : undefined
                      }
                      onMouseLeave={() => setTooltip(null)}
                    >
                      <span className="text-xs font-bold leading-tight">{cell.unitNo}</span>
                      {cell.status === 'amenity' && (
                        <span className="mt-0.5 text-[9px] font-medium uppercase leading-tight tracking-wide">
                          Amenity
                        </span>
                      )}
                      {cell.status === 'commercial' && (
                        <span className="mt-0.5 text-[9px] font-medium uppercase leading-tight tracking-wide">
                          Comm.
                        </span>
                      )}
                      {cell.status === 'allocated' && (
                        <span className="mt-0.5 w-[calc(100%-4px)] truncate px-0.5 text-center text-[9px] leading-tight">
                          {cell.allocation?.applicant_name?.split(' ')[0]}
                        </span>
                      )}
                    </div>
                  )

                  const gap = cellIdx === 4 ? <div className="w-6 shrink-0" /> : null

                  if (cell.status === 'allocated' && cell.allocation) {
                    return (
                      <Fragment key={cell.unitNo}>
                        {gap}
                        <Link href={`/bookings/${cell.allocation.booking_id}`} title="View booking">
                          {inner}
                        </Link>
                      </Fragment>
                    )
                  }
                  if (cell.status === 'available' || cell.status === 'commercial') {
                    return (
                      <Fragment key={cell.unitNo}>
                        {gap}
                        <Link href={`/new-booking?unit=${cell.unitNo}`} title="Create booking">
                          {inner}
                        </Link>
                      </Fragment>
                    )
                  }
                  return (
                    <Fragment key={cell.unitNo}>
                      {gap}
                      <div>{inner}</div>
                    </Fragment>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {tooltip && (() => {
        const alloc = allocations.find(a => a.unit_no === tooltip.unitNo)
        if (!alloc) return null
        return (
          <div
            className="pointer-events-none fixed z-50 rounded-lg bg-zinc-900 px-3 py-2 text-xs text-white shadow-xl"
            style={{ left: tooltip.x, top: tooltip.y - 64 }}
          >
            <p className="font-semibold">{alloc.applicant_name}</p>
            {alloc.serial_display && <p className="text-zinc-400">{alloc.serial_display}</p>}
            <p className="capitalize text-zinc-400">{alloc.status.toLowerCase()}</p>
          </div>
        )
      })()}
    </div>
  )
}
