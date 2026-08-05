// helpers for the issue panel: byte formatting + content-type icon picker.
// Lives in meta.tsx (not its own file) because it's a small piece of
// visual-only logic that belongs with the other meta components.

import { File, FileArchive, FileCode, FileImage, FileText, FileVideo, Music } from 'lucide-react'
import { cn } from '../../lib/utils'

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function FileTypeIcon({ contentType, className }: { contentType: string; className?: string }) {
  const Icon =
    contentType.startsWith('image/') ? FileImage
    : contentType.startsWith('video/') ? FileVideo
    : contentType.startsWith('audio/') ? Music
    : contentType === 'application/pdf' || contentType.startsWith('text/') ? FileText
    : contentType.includes('zip') || contentType.includes('tar') || contentType.includes('archive') ? FileArchive
    : contentType.includes('json') || contentType.includes('xml') || contentType.includes('code') ? FileCode
    : File
  return <Icon className={cn('size-3.5 text-muted-foreground shrink-0', className)} />
}
