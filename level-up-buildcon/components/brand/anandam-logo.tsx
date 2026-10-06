import Image from 'next/image'
import { cn } from '@/lib/utils'

const sizeMap = {
  sm: 'size-10',
  md: 'size-14',
  lg: 'size-20',
  header: 'size-12 md:size-16',
} as const

interface AnandamLogoProps {
  size?: keyof typeof sizeMap
  showTitle?: boolean
  titleClassName?: string
  className?: string
}

export function AnandamLogo({
  size = 'header',
  showTitle = true,
  titleClassName,
  className,
}: AnandamLogoProps) {
  return (
    <div className={cn('flex items-center gap-3 md:gap-4', className)}>
      <div className={cn('relative shrink-0 overflow-hidden rounded-xl shadow-sm', sizeMap[size])}>
        <Image
          src="/anandam-logo.png"
          alt="Anandam — Level Up Buildcon"
          fill
          className="object-cover"
          priority
        />
      </div>
      {showTitle && (
        <div className="hidden sm:block">
          <p className={cn('text-base font-semibold tracking-tight text-zinc-900 md:text-lg', titleClassName)}>
            Level Up Buildcon
          </p>
        </div>
      )}
    </div>
  )
}
