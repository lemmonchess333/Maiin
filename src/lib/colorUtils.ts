export const macroColors = {
  calories: "#f97316",
  protein: "#3b82f6",
  carbs: "#f59e0b",
  fat: "#a855f7",
};

export function tint(hex: string, opacity = 0.12) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}