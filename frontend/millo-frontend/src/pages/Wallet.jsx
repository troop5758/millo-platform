import { useEffect, useState } from "react";
import { request } from "../api/client";

export default function Wallet() {
  const [wallet, setWallet] = useState(null);

  useEffect(() => {
    request("/wallet").then(setWallet);
  }, []);

  return (
    <div>
      <h2>Wallet</h2>
      <p>Balance: {wallet?.balance}</p>
      <p>Earnings: {wallet?.earnings}</p>

      <button onClick={() => alert("Stripe coming next")}>
        Buy Coins
      </button>
    </div>
  );
}
