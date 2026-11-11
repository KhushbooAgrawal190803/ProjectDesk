import Image from 'next/image'
import { cn } from '@/lib/utils'

interface AnandamLogoProps {
  showTitle?: boolean
  titleClassName?: string
  className?: string
  /** Light background. The letterhead mark is black. */
  onDark?: boolean
}

export function AnandamLogo({ className, onDark = false }: AnandamLogoProps) {
  return (
    <Image
      src="/level-up-buildcon-logo.jpg"
      alt="Level Up Buildcon"
      width={280}
      height={120}
      priority
      className={cn('h-16 w-auto object-contain object-left', onDark && 'brightness-0 invert', className)}
    />
  )
}
