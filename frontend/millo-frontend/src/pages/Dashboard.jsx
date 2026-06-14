import { useEffect, useState } from "react";
import { request } from "../api/client";

export default function Dashboard() {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    request("/profile/me").then(setProfile);
  }, []);

  async function goLive() {
    const res = await request("/stream/key");
    alert("Stream Key: " + res.streamKey);
  }

  return (
    <div>
      <h2>Creator Dashboard</h2>

      <p>Followers: {profile?.followers}</p>
      <p>Creator: {profile?.isCreator ? "Yes" : "No"}</p>

      <button onClick={goLive}>Go Live</button>
    </div>
  );
}
