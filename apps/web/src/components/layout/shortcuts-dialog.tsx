import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'Global',
    items: [
      ['?', 'Show this shortcuts dialog'],
      ['c', 'Create issue'],
      ['Ctrl K', 'Command palette'],
      ['Ctrl N', 'Create issue'],
      ['/', 'Focus quick search'],
      ['1', 'Go to backlog'],
      ['2', 'Go to board'],
    ],
  },
  {
    title: 'Navigating issues',
    items: [
      ['j', 'Next issue'],
      ['k', 'Previous issue'],
      ['o or Enter', 'Open selected issue'],
      ['n / p', 'Next / previous column (board)'],
      ['e', 'Edit selected issue'],
    ],
  },
  {
    title: 'Search (TQ)',
    items: [
      ['assignee = me', 'Issues assigned to you'],
      ['assignee is empty', 'Unassigned issues'],
      ['status in (Done, QA)', 'Multiple statuses'],
      ['created >= -7d', 'Created in the last 7 days'],
      ['label ~ bug', 'Labels matching'],
      ['... ORDER BY priority DESC', 'Sort results'],
    ],
  },
]

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group.title}</p>
              <div className="grid gap-1.5">
                {group.items.map(([keys, action]) => (
                  <div key={keys} className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-muted-foreground">{action}</span>
                    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">{keys}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
