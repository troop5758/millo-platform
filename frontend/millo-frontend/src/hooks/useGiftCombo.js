import { useRef, useState } from "react";

export default function useGiftCombo() {
  const lastGiftTime = useRef(0);
  const [combo, setCombo] = useState(1);

  function registerGift() {
    const now = Date.now();

    if (now - lastGiftTime.current < 3000) {
      setCombo((c) => c + 1);
    } else {
      setCombo(1);
    }

    lastGiftTime.current = now;
  }

  return { combo, registerGift };
}
