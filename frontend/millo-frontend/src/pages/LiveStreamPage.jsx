import { useEffect } from "react";
import io from "socket.io-client";

import LivePlayer from "../components/LivePlayer";
import GiftOverlay from "../components/GiftOverlay";
import GiftLeaderboard from "../components/GiftLeaderboard";

const socket = io("https://milloapp.com", {
  transports: ["websocket"],
  auth: {
    token: localStorage.getItem("token")
  }
});

export default function LiveStreamPage() {
  const streamId = "test123"; // replace dynamically later

  useEffect(() => {
    socket.emit("stream:join", streamId);

    return () => {
      socket.emit("stream:leave", streamId);
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <LivePlayer streamId={streamId} />

      {/* 🎁 Gift animations */}
      <GiftOverlay socket={socket} streamId={streamId} />

      {/* 🏆 Leaderboard */}
      <GiftLeaderboard socket={socket} streamId={streamId} />
    </div>
  );
}
