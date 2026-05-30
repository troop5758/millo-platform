import AppShell from "@/components/layout/app-shell"

export default async function CreatorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {

  const { id } = await params

  return (
    <AppShell>

      <h1 className="text-5xl font-bold">
        Creator #{id}
      </h1>

    </AppShell>
  )
}
