export const cleanAIResponse = (text: string) =>
  text.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();

export const capitalize = (s: string) =>
  s.charAt(0).toUpperCase() + s.slice(1);