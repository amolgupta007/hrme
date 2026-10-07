// Plain-text teaser of an announcement's markdown body, for the "new
// announcement" email. The full text stays in the app ("Read now").

const MAX_CHARS = 280;

export function announcementExcerpt(markdown: string, maxChars = MAX_CHARS): string {
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → their text
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "") // headings, quotes, list markers
    .replace(/(\*\*|__|\*|_|~~|`)/g, "") // emphasis + inline code
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
