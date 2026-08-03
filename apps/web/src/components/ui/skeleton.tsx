import { cn } from '@/lib/utils'

/** Skeleton shimmer for loading placeholders. Uses the .skeleton class
 *  in index.css (dark-mode-tuned color + pulse animation). */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('skeleton', className)} {...props} />
}
