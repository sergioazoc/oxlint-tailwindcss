export function Typos() {
  return (
    <div>
      {/* expect: unknown */}
      <div className="itms-center flex">typo items</div>
      {/* expect: unknown */}
      <div className="jusitfy-between flex">typo justify</div>
      {/* expect: unknown */}
      <div className="bg-primray">typo token</div>
      {/* expect: unknown */}
      <div className="text-muted-foregound">typo token 2</div>
      {/* expect: unknown */}
      <div className="rounded-huge">unknown radius</div>
      {/* expect: unknown */}
      <div className="flex-cols">unknown flex</div>
      {/* expect: unknown */}
      <div className="shadow-xxl">unknown shadow</div>
      {/* expect: unknown */}
      <div className="md:grids-col-2 grid">typo grid</div>
      {/* expect: unknown */}
      <div className="bg-chart-6">undeclared token</div>
      {/* expect: ok */}
      <div className="bg-surface text-code-foreground">declared custom tokens OK</div>
    </div>
  )
}
