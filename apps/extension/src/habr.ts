const articlePattern = /\/(?:articles|company\/[^/]+\/(?:blog|publications)|companies\/[^/]+\/(?:blog|publications))\/(\d+)(?:\/|$)/;

export function articleIdFromUrl(value: string): number | null {
  const match = new URL(value, "https://habr.com").pathname.match(articlePattern);
  return match?.[1] ? Number(match[1]) : null;
}

export function articleIdFromCard(card: Element): number | null {
  for (const link of card.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const id = articleIdFromUrl(link.href);
    if (id) return id;
  }
  if (card.classList?.contains("tm-article-presenter") && typeof location !== "undefined") return articleIdFromUrl(location.href);
  return null;
}

export function articleCards(root: ParentNode = document): Element[] {
  return [...root.querySelectorAll(".tm-articles-list__item, .tm-page-article-box, .tm-article-presenter")].filter((card) => articleIdFromCard(card));
}
