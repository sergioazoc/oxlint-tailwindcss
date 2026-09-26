import { cva } from "class-variance-authority"
import { cn } from "cn"

import { Button } from "@/registry/new-york-v4/ui/button"

const pill = cva("rounded-full px-2", {
  variants: {
    tone: {
      // expect: palette
      danger: "bg-red-500 text-white",
      // expect: arbitrary, palette
      info: "bg-[#0ea5e9] text-white",
    },
  },
})

export function Dynamic({ color, active }: { color: string; active: boolean }) {
  return (
    <div>
      {/* expect: dynamic */}
      <div className={`bg-${color}-500 p-2`}>template</div>
      {/* expect: palette */}
      <div className={cn("p-2", active && "bg-emerald-500")}>cn cond</div>
      <span className={pill({ tone: "danger" })}>pill</span>
      {/* expect: restyle */}
      <Button className={cn(active && "rounded-none")}>cn on component</Button>
      {/* expect: inline-style */}
      <div style={{ color: "#f00", padding: 12 }}>inline style</div>
    </div>
  )
}
