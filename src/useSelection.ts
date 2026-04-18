import { useState } from "react";

export function useSelection() {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) => {
    setSelected(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id]
    );
  };

  const clear = () => setSelected([]);

  const set = (ids: string[]) => setSelected(ids);

  return { selected, toggle, clear, set };
}