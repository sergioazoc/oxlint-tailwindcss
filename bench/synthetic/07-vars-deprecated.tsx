export function Vars() {
  return (
    <div>
      <div className="bg-(--primary)">var ref to token</div>
      <div className="text-[var(--muted-foreground)]">bracket var to token</div>
      <div className="border-(--border) border">var to border token</div>
      <div className="bg-(--brand-unknown)">undefined var</div>
      <div className="bg-gradient-to-r from-primary to-secondary">deprecated gradient</div>
      <div className="flex-shrink-0">deprecated shrink</div>
      <div className="rounded">v4 bare rounded (valid)</div>
      <div className="data-[disabled]:opacity-50">non-canonical variant</div>
      <div className="h-4 w-4">shorthand size-4</div>
      <div className="dark:hover:bg-accent">variant order</div>
    </div>
  )
}
