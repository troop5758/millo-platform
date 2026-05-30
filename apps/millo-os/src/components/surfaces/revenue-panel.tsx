import { getRevenue } from "@/lib/api/revenue"

export default async function RevenuePanel() {
let revenue:any = {}

try {
revenue = await getRevenue()
} catch {
revenue = {}
}

return ( <section className="surface p-8"> <h2 className="text-3xl font-bold mb-6">
Revenue Dashboard </h2>

  <div className="grid md:grid-cols-4 gap-4">
    <div>
      Balance:
      {" "}
      ${revenue.balance || 0}
    </div>

    <div>
      Revenue:
      {" "}
      ${revenue.revenue || 0}
    </div>

    <div>
      Payouts:
      {" "}
      ${revenue.payouts || 0}
    </div>

    <div>
      Subscriptions:
      {" "}
      {revenue.subscriptions || 0}
    </div>
  </div>
</section>

)
}
