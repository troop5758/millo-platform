import { getProducts } from "@/lib/api/products"
import { rankProducts } from "@/lib/discovery/marketplace-ranking"

export default async function MarketplaceRail() {
  let products: any[] = []

  try {
    products = rankProducts(await getProducts())
  } catch {
    products = []
  }

  return (
    <section className="space-y-4">
      <h2 className="text-3xl font-bold">
        Marketplace Picks
      </h2>

      <div className="grid md:grid-cols-4 gap-4">
        {products.slice(0, 8).map((product: any) => (
          <div
            key={product.id || product._id}
            className="surface p-6"
          >
            <h3>
              {product.name || "Product"}
            </h3>

            <p>
              ${product.price || 0}
            </p>

            <p>
              {product.category || "General"}
            </p>

            <p>
              Score: {Math.round(product.score || 0)}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
