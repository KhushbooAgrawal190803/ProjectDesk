'use client'

import { useState } from 'react'
import { MoreHorizontal, Trash2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DeleteBookingButton } from './delete-button'
import { RevertToDraftButton } from './revert-to-draft-button'

/** Exceptional actions, kept away from everyday ones. Each still asks for confirmation, and the server checks the role. */
export function MoreActionsMenu({
  bookingId,
  bookingStatus,
  canRevert,
  canDelete,
}: {
  bookingId: string
  bookingStatus: string
  canRevert: boolean
  canDelete: boolean
}) {
  const [revertOpen, setRevertOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const showRevert = canRevert && bookingStatus !== 'DRAFT'
  if (!showRevert && !canDelete) return null
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2" aria-label="More actions">
            <MoreHorizontal className="h-4 w-4" />
            More
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {showRevert && (
            <DropdownMenuItem onSelect={() => setRevertOpen(true)} className="gap-2">
              <Undo2 className="h-4 w-4" />
              Back to Draft
            </DropdownMenuItem>
          )}
          {showRevert && canDelete && <DropdownMenuSeparator />}
          {canDelete && (
            <DropdownMenuItem onSelect={() => setDeleteOpen(true)} className="gap-2 text-red-600 focus:text-red-700">
              <Trash2 className="h-4 w-4" />
              Delete booking
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {showRevert && (
        <RevertToDraftButton bookingId={bookingId} canRevert bookingStatus={bookingStatus} open={revertOpen} onOpenChange={setRevertOpen} />
      )}
      {canDelete && <DeleteBookingButton bookingId={bookingId} canDelete open={deleteOpen} onOpenChange={setDeleteOpen} />}
    </>
  )
}
