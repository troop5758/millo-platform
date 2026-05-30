import AppShell from "@/components/layout/app-shell"

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {

  const { id } = await params

  return (
    <AppShell>

      <h1 className="text-5xl font-bold">
        Product #{id}
      </h1>

    </AppShell>
  )
}
