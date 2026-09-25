import { Badge } from "@/registry/new-york-v4/ui/badge"
import { Button } from "@/registry/new-york-v4/ui/button"
import { Card, CardContent, CardTitle } from "@/registry/new-york-v4/ui/card"

export function Checkout() {
  return (
    <Card className="p-8 shadow-xl">
      <CardTitle className="text-2xl font-bold">Checkout</CardTitle>
      <CardContent className="mt-2">
        <Badge className="rounded-sm px-3 text-sm">New</Badge>
        <Button className="p-4 rounded-full">Pay</Button>
        <Button className="bg-blue-600 text-white hover:bg-blue-700">Buy</Button>
        <Button className="h-12 w-48">Big</Button>
        <Button className="mt-4 w-full">Allowed layout</Button>
        <Button size="lg" variant="outline">Allowed props</Button>
      </CardContent>
    </Card>
  )
}
