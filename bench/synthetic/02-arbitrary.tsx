export function Layout() {
  return (
    <main>
      {/* expect: arbitrary */}
      <div className="p-[13px]">odd padding</div>
      {/* expect: arbitrary */}
      <div className="w-[350px]">fixed width</div>
      {/* expect: arbitrary */}
      <div className="text-[15px]">odd text</div>
      {/* expect: arbitrary */}
      <div className="rounded-[10px]">odd radius</div>
      {/* expect: canonical, scale, arbitrary */}
      <div className="mt-[16px]">same as mt-4</div>
      {/* expect: canonical, scale, arbitrary */}
      <div className="top-[1px] relative">same as top-px</div>
      {/* expect: canonical, scale, arbitrary */}
      <div className="min-h-[100vh]">same as min-h-screen</div>
      <div className="w-(--sidebar-width)">css var ref</div>
      <div className="grid-cols-[200px_1fr] grid">template</div>
      {/* expect: ok */}
      <div className="p-4">OK scale</div>
    </main>
  )
}
