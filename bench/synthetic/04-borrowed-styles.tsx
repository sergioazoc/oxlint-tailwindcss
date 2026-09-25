export function RawClones() {
  return (
    <div>
      <button className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium whitespace-nowrap text-primary-foreground hover:bg-primary/90 h-9">
        Raw Button clone
      </button>
      <input className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none placeholder:text-muted-foreground md:text-sm" />
      <div className="flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm">
        Raw Card clone
      </div>
      <span className="inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground">
        Raw Badge clone
      </span>
    </div>
  )
}
