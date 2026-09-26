import { Badge } from "@/registry/new-york-v4/ui/badge"
import { Button } from "@/registry/new-york-v4/ui/button"
import { Card, CardContent, CardTitle } from "@/registry/new-york-v4/ui/card"

export function Checkout() {
  return (
    // expect: restyle
    <Card className="p-8 shadow-xl">
      {/* expect: restyle */}
      <CardTitle className="text-2xl font-bold">Checkout</CardTitle>
      {/* expect: ok */}
      <CardContent className="mt-2">
        {/* expect: restyle */}
        <Badge className="rounded-sm px-3 text-sm">New</Badge>
        {/* expect: restyle */}
        <Button className="p-4 rounded-full">Pay</Button>
        {/* expect: restyle, palette */}
        <Button className="bg-blue-600 text-white hover:bg-blue-700">Buy</Button>
        <Button className="h-12 w-48">Big</Button>
        {/* expect: ok */}
        <Button className="mt-4 w-full">Allowed layout</Button>
        {/* expect: ok */}
        <Button size="lg" variant="outline">Allowed props</Button>
      </CardContent>
    </Card>
  )
}
