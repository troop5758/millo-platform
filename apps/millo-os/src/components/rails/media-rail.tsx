"use client"

export default function MediaRail({
  title,
  items
}: any) {

  return (

    <section className="mb-12">

      <h2 className="
        text-3xl
        font-bold
        mb-6
      ">
        {title}
      </h2>

      <div className="
        flex
        gap-5
        overflow-x-auto
      ">

        {items.map((item:any)=>(

          <div
            key={item.id}
            className="
              min-w-[320px]
              rounded-[28px]
              overflow-hidden
              bg-[#12161E]
            "
          >

            <img
              src={item.image}
              className="
                h-[190px]
                w-full
                object-cover
              "
            />

            <div className="p-5">
              <div className="font-semibold">
                {item.title}
              </div>
            </div>

          </div>

        ))}

      </div>

    </section>
  )
}
