import { useEffect, useState } from "react";

export default function GiftLeaderboard({ socket, streamId }) {
  const [leaders, setLeaders] = useState([]);

  useEffect(() => {
    if (!socket) return;

    // Real-time update
    socket.on("stream:gift", ({ userId, gift }) => {
      setLeaders((prev) => {
        const updated = [...prev];

        const existing = updated.find((u) => u.userId === userId);

        if (existing) {
          existing.score += gift.price;
        } else {
          updated.push({ userId, score: gift.price });
        }

        return updated
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
      });
    });

    return () => socket.off("stream:gift");
  }, [socket]);

  return (
    <div style={styles.container}>
      <h3>🏆 Top Gifters</h3>

      {leaders.map((u, i) => (
        <div key={u.userId} style={styles.row}>
          #{i + 1} {u.userId.slice(0, 6)} — {u.score}
        </div>
      ))}
    </div>
  );
}

const styles = {
  container: {
    position: "absolute",
    top: 20,
    right: 20,
    background: "rgba(0,0,0,0.7)",
    color: "#fff",
    padding: 12,
    borderRadius: 10,
    width: 180
  },
  row: {
    fontSize: 14,
    marginTop: 6
  }
};
