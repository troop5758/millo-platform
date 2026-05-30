import GlassCard from "@/components/ui/glass-card"

export default function LiveRail() {

return (

<section>

  <h2 className="text-3xl font-bold mb-6">
    Live Now
  </h2>

  <div className="grid md:grid-cols-3 gap-6">

    {[1,2,3].map((i)=>(
      <GlassCard key={i}>
        Live Stream {i}
      </GlassCard>
    ))}

  </div>

</section>

)
}
