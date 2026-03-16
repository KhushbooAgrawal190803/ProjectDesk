'use client'

import { Fragment, useState, useTransition } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getAllKnownFlats, isAmenityFlat, isCommercialFlat } from '@/lib/data/flat-areas'
import { getTowerAllocations, AllocatedUnit } from './tower-actions'

const FLOORS = 10
const UNITS_PER_FLOOR = 8
const PROJECT = 'Anandam'

// All valid flat numbers for the project, floor 10 → floor 1
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

const STATUS_STYLES: Record<FlatStatus, string> = {
  available:   'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100',
  allocated:   'bg-red-50 border-red-400 text-red-800 hover:bg-red-100 cursor-pointer',
  amenity:     'bg-zinc-100 border-zinc-300 text-zinc-400 cursor-default',
  commercial:  'bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100',
}

interface TowerViewProps {
  initialAllocations: AllocatedUnit[]
  showHeader?: boolean
}

export function TowerView({ initialAllocations, showHeader = true }: TowerViewProps) {
  const [allocations, setAllocations] = useState(initialAllocations)
  const [isPending, startTransition] = useTransition()
  const [tooltip, setTooltip] = useState<{ unitNo: string; x: number; y: number } | null>(null)

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

  return (
    <div className="space-y-6">
      {/* Header — hidden when embedded in a Card that already has a title */}
      <div className="flex items-center justify-between">
        {showHeader ? (
          <div>
            <h2 className="text-xl font-semibold text-zinc-900">Anandam — Tower View</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            {totalAllocated} allocated · {totalAvailable} available · {totalCommercial} commercial · {totalAmenity} amenity
          </p>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          {totalAllocated} allocated · {totalAvailable} available · {totalCommercial} commercial · {totalAmenity} amenity
        </p>
        )}
        <Button variant="outline" size="sm" onClick={refresh} disabled={isPending} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${isPending ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded border-2 bg-emerald-50 border-emerald-300" />
          <span className="text-zinc-600">Available</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded border-2 bg-red-50 border-red-400" />
          <span className="text-zinc-600">Allocated</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded border-2 bg-orange-50 border-orange-300" />
          <span className="text-zinc-600">Commercial (available)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded border-2 bg-zinc-100 border-zinc-300" />
          <span className="text-zinc-600">Amenity</span>
        </div>
      </div>

      {/* Tower Grid */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-max">
          {/* Column headers */}
          <div className="flex items-center mb-1 ml-20">
            {Array.from({ length: UNITS_PER_FLOOR }, (_, i) => (
              <Fragment key={i}>
                {i === 4 && <div className="w-5 shrink-0" />}
                <div className="w-16 text-center text-xs text-zinc-400 font-medium">
                  Unit {String(i + 1).padStart(2, '0')}
                </div>
              </Fragment>
            ))}
          </div>

          {/* Rows */}
          {grid.map((row, rowIdx) => {
            const floor = FLOORS - rowIdx
            return (
              <div key={floor} className="flex items-center mb-1.5">
                {/* Floor label */}
                <div className="w-20 text-right pr-3 text-sm font-semibold text-zinc-500 shrink-0">
                  Floor {floor}
                </div>

                {/* Flat cells */}
                {row.map((cell, cellIdx) => {
                  const inner = (
                    <div
                      key={cell.unitNo}
                      className={`w-16 h-14 mx-0.5 rounded-lg border-2 flex flex-col items-center justify-center select-none transition-colors ${STATUS_STYLES[cell.status]}`}
                      onMouseEnter={cell.status === 'allocated' ? (e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setTooltip({ unitNo: cell.unitNo, x: rect.left, y: rect.top })
                      } : undefined}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      <span className="text-xs font-bold leading-tight">{cell.unitNo}</span>
                      {cell.status === 'amenity' && (
                        <span className="text-[9px] uppercase tracking-wide leading-tight mt-0.5">Amenity</span>
                      )}
                      {cell.status === 'commercial' && (
                        <span className="text-[9px] uppercase tracking-wide leading-tight mt-0.5">Comm.</span>
                      )}
                      {cell.status === 'allocated' && (
                        <span className="text-[9px] leading-tight mt-0.5 truncate w-14 text-center px-1">
                          {cell.allocation?.applicant_name?.split(' ')[0]}
                        </span>
                      )}
                    </div>
                  )

                  if (cell.status === 'allocated' && cell.allocation) {
                    return (
                      <Fragment key={cell.unitNo}>
                        {cellIdx === 4 && <div className="w-5 shrink-0" />}
                        <Link href={`/bookings/${cell.allocation.booking_id}`} title="View booking">
                          {inner}
                        </Link>
                      </Fragment>
                    )
                  }
                  if (cell.status === 'available' || cell.status === 'commercial') {
                    return (
                      <Fragment key={cell.unitNo}>
                        {cellIdx === 4 && <div className="w-5 shrink-0" />}
                        <Link href={`/new-booking?unit=${cell.unitNo}`} title="Create booking">
                          {inner}
                        </Link>
                      </Fragment>
                    )
                  }
                  return (
                    <Fragment key={cell.unitNo}>
                      {cellIdx === 4 && <div className="w-5 shrink-0" />}
                      <div>{inner}</div>
                    </Fragment>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (() => {
        const alloc = allocations.find(a => a.unit_no === tooltip.unitNo)
        if (!alloc) return null
        return (
          <div
            className="fixed z-50 bg-zinc-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl pointer-events-none"
            style={{ left: tooltip.x, top: tooltip.y - 64 }}
          >
            <p className="font-semibold">{alloc.applicant_name}</p>
            {alloc.serial_display && <p className="text-zinc-400">{alloc.serial_display}</p>}
            <p className="text-zinc-400 capitalize">{alloc.status.toLowerCase()}</p>
          </div>
        )
      })()}
    </div>
  )
}
