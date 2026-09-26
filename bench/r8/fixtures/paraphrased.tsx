// The same four components rebuilt from memory rather than copied: the classes
// shadcn/ui's older (new-york) versions used, which is what a developer or an
// agent trained on them writes — another order, some classes left out, some
// values changed.
export function Rebuilt() {
  return (
    <div>
      {/* expect: Button */}
      <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        Pay
      </button>
      {/* expect: Input */}
      <input className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground" />
      {/* expect: Card */}
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">Plan</div>
      {/* expect: Badge */}
      <span className="rounded-md bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
        New
      </span>
    </div>
  )
}
