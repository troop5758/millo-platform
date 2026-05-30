export default function Surface({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      className="
      rounded-3xl
      border border-white/10
      bg-white/5
      backdrop-blur-xl
      p-8
      "
    >
      {children}
    </div>
  )
}
