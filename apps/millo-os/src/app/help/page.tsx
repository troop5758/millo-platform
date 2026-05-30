import HelpSearch from "@/components/help/help-search"
import HelpCategoryGrid from "@/components/help/help-category-grid"

export default function HelpPage() {
  return (
    <main className="max-w-7xl mx-auto py-16 px-6">
      <h1 className="text-5xl font-bold mb-8">
        Help Center
      </h1>

      <div className="mb-8">
        <HelpSearch />
      </div>

      <div className="mt-12">
        <HelpCategoryGrid />
      </div>
    </main>
  )
}
