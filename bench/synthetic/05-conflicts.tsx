export function Conflicts() {
  return (
    <div>
      {/* expect: conflicts */}
      <div className="line-clamp-1 flex">clamp broken</div>
      {/* expect: conflicts */}
      <div className="p-4 p-6">double padding</div>
      {/* expect: conflicts */}
      <div className="text-sm text-base">double size</div>
      {/* expect: conflicts */}
      <div className="block flex">double display</div>
      {/* expect: conflicts */}
      <div className="size-5 w-4">size vs width</div>
      {/* expect: duplicates */}
      <div className="flex flex items-center">duplicate</div>
      {/* expect: variants */}
      <div className="pt-3 xl:pt-3">redundant variant</div>
      {/* expect: conflicts */}
      <div className="absolute sr-only">redundant position</div>
      {/* expect: whitespace */}
      <div className="mt-2   mb-2">whitespace</div>
    </div>
  )
}
