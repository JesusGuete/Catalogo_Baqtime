import { useState } from "react";

export default function PruebaIsla() {
  const [contador, setContador] = useState(0);
  return (
    <button onClick={() => setContador((c) => c + 1)}>
      Isla React OK — clics: {contador}
    </button>
  );
}
