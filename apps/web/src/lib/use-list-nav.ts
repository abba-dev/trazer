import { useCallback, useEffect, useRef, useState } from 'react'

export type ListNavOptions<T> = {
  items: T[]
  onOpen: (item: T, index: number) => void
  enabled?: boolean
  extra?: (e: KeyboardEvent, nav: { move: (d: number) => void; select: (i: number) => void; selectedIndex: number }) => boolean | void
}

export function useListNav<T>({ items, onOpen, enabled = true, extra }: ListNavOptions<T>) {
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const itemRefs = useRef<(HTMLElement | null)[]>([])

  const move = useCallback(
    (delta: number) => {
      setSelectedIndex((prev) => {
        if (items.length === 0) return -1
        if (prev === -1) return delta > 0 ? 0 : items.length - 1
        return Math.min(items.length - 1, Math.max(0, prev + delta))
      })
    },
    [items.length],
  )

  const select = useCallback((i: number) => setSelectedIndex(i), [])

  useEffect(() => {
    setSelectedIndex((prev) => (items.length === 0 ? -1 : Math.min(prev, items.length - 1)))
  }, [items.length])

  useEffect(() => {
    const el = itemRefs.current[selectedIndex]
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const nav = { move, select, selectedIndex }
      if (extra && extra(e, nav) === false) return

      switch (e.key.toLowerCase()) {
        case 'j':
          e.preventDefault()
          move(1)
          break
        case 'k':
          e.preventDefault()
          move(-1)
          break
        case 'o':
        case 'enter': {
          if (selectedIndex >= 0 && items[selectedIndex]) {
            e.preventDefault()
            onOpen(items[selectedIndex], selectedIndex)
          }
          break
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, items, selectedIndex, onOpen, move, select, extra])

  return { selectedIndex, move, select, setItemRef: (i: number) => (el: HTMLElement | null) => { itemRefs.current[i] = el } }
}
