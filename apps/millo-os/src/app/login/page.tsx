export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#07090D] text-white">

      <div className="w-full max-w-md rounded-3xl bg-white/5 p-8">

        <h1 className="text-4xl font-bold mb-6">
          Login
        </h1>

        <input
          className="w-full p-3 rounded-xl bg-black mb-4"
          placeholder="Email"
        />

        <input
          className="w-full p-3 rounded-xl bg-black mb-4"
          placeholder="Password"
          type="password"
        />

        <button className="w-full bg-purple-600 p-3 rounded-xl">
          Sign In
        </button>

      </div>

    </div>
  )
}
