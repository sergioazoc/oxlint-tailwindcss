export function PricingBanner() {
  return (
    <section>
      {/* expect: palette */}
      <div className="flex bg-red-500 p-4">Sale</div>
      {/* expect: palette */}
      <p className="text-gray-600">Subtitle</p>
      {/* expect: palette */}
      <div className="border border-slate-200">Box</div>
      {/* expect: palette */}
      <div className="bg-white">White</div>
      {/* expect: palette */}
      <div className="text-black">Black</div>
      {/* expect: arbitrary */}
      <div className="bg-[#1a73e8] p-2">Hex</div>
      {/* expect: arbitrary */}
      <div className="shadow-[0_1px_2px_rgba(0,0,0,0.1)]">Shadow</div>
      {/* expect: arbitrary */}
      <div className="text-[oklch(0.6_0.2_250)]">Oklch</div>
      {/* expect: palette */}
      <div className="hover:bg-blue-600/80">Hover raw</div>
      <svg fill="#ff0000" viewBox="0 0 10 10"><rect width="10" height="10" /></svg>
      {/* expect: ok */}
      <div className="bg-primary text-primary-foreground">OK token</div>
    </section>
  )
}
