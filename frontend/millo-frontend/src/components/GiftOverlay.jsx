import { useEffect, useState } from "react";
import useGiftCombo from "../hooks/useGiftCombo";

export default function GiftOverlay({ socket, streamId }) {
  const [gifts, setGifts] = useState([]);
  const { combo, registerGift } = useGiftCombo();

  useEffect(() => {
    if (!socket) return;

    const handler = (data) => {
      const id = Date.now() + Math.random();

      registerGift();

      setGifts((prev) => [...prev, { id, ...data }]);

      setTimeout(() => {
        setGifts((prev) => prev.filter((g) => g.id !== id));
      }, 4000);
    };

    socket.on("stream:gift", handler);

    return () => socket.off("stream:gift", handler);
  }, [socket]);

  return (
    <div style={styles.container}>
      {gifts.map((g) => (
        <div key={g.id} style={styles.gift}>
          🎁 {g.gift.name}
        </div>
      ))}

      {combo > 1 && (
        <div style={styles.combo}>
          🔥 x{combo}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    position: "absolute",
    bottom: 20,
    left: 20,
    pointerEvents: "none"
  },
  gift: {
    background: "rgba(0,0,0,0.7)",
    color: "#fff",
    padding: "10px 14px",
    marginTop: 8,
    borderRadius: 20,
    animation: "floatUp 4s ease-out forwards"
  },
  combo: {
    position: "absolute",
    bottom: 100,
    left: 0,
    fontSize: 28,
    fontWeight: "bold",
    color: "#ffcc00"
  }
};
