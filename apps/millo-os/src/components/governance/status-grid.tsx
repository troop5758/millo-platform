export default function StatusGrid() {
const systems = [
"Frontend",
"Database",
"Redis",
"Livestream",
"Payments"
]

return ( <div className="grid md:grid-cols-3 gap-6">
{systems.map(system => ( <div
       key={system}
       className="surface p-6"
     > <h3 className="font-semibold">
{system} </h3>

      <p className="text-green-500">
        Healthy
      </p>
    </div>
  ))}
</div>

)
}
