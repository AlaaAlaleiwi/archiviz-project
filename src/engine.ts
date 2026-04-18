export const genId = () => Math.random().toString(36).slice(2, 10);

export const snap = (v: number, grid = 20) =>
  Math.round(v / grid) * grid;