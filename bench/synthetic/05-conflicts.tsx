export function Conflicts() {
  return (
    <div>
      <div className="line-clamp-1 flex">clamp broken</div>
      <div className="p-4 p-6">double padding</div>
      <div className="text-sm text-base">double size</div>
      <div className="block flex">double display</div>
      <div className="size-5 w-4">size vs width</div>
      <div className="flex flex items-center">duplicate</div>
      <div className="pt-3 xl:pt-3">redundant variant</div>
      <div className="absolute sr-only">redundant position</div>
      <div className="mt-2   mb-2">whitespace</div>
    </div>
  )
}
