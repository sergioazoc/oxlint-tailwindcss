export function Vars() {
  return (
    <div>
      {/* expect: var-token, arbitrary */}
      <div className="bg-(--primary)">var ref to token</div>
      {/* expect: var-token, arbitrary */}
      <div className="text-[var(--muted-foreground)]">bracket var to token</div>
      {/* expect: var-token, arbitrary */}
      <div className="border-(--border) border">var to border token</div>
      <div className="bg-(--brand-unknown)">undefined var</div>
      {/* expect: deprecated, canonical */}
      <div className="bg-gradient-to-r from-primary to-secondary">deprecated gradient</div>
      {/* expect: deprecated, canonical */}
      <div className="flex-shrink-0">deprecated shrink</div>
      <div className="rounded">v4 bare rounded (valid)</div>
      <div className="data-[disabled]:opacity-50">non-canonical variant</div>
      {/* expect: shorthand, canonical */}
      <div className="h-4 w-4">shorthand size-4</div>
      {/* expect: dark-without-light */}
      <div className="dark:hover:bg-accent">variant order</div>
    </div>
  )
}
