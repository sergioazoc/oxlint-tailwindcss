export function Layout() {
  return (
    <main>
      <div className="p-[13px]">odd padding</div>
      <div className="w-[350px]">fixed width</div>
      <div className="text-[15px]">odd text</div>
      <div className="rounded-[10px]">odd radius</div>
      <div className="mt-[16px]">same as mt-4</div>
      <div className="top-[1px] relative">same as top-px</div>
      <div className="min-h-[100vh]">same as min-h-screen</div>
      <div className="w-(--sidebar-width)">css var ref</div>
      <div className="grid-cols-[200px_1fr] grid">template</div>
      <div className="p-4">OK scale</div>
    </main>
  )
}
