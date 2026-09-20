import { describe, expect, it } from "vitest";
import { articleCards, articleIdFromCard, articleIdFromUrl } from "./habr.js";

function card(...hrefs: string[]): Element {
  return { querySelectorAll: () => hrefs.map((href) => ({ href }) as HTMLAnchorElement) } as unknown as Element;
}

describe("Habr article adapter", () => {
  it.each([
    ["https://habr.com/ru/articles/123/?utm_source=x#comments", 123],
    ["https://habr.com/ru/company/acme/blog/456/?hl=en", 456],
    ["https://habr.com/ru/companies/acme/publications/789/", 789],
  ])("normalizes %s", (url, id) => expect(articleIdFromUrl(url)).toBe(id));
  it("ignores non-article links", () => expect(articleIdFromUrl("https://habr.com/ru/news/123/")).toBeNull());
  it("extracts IDs from cards and ignores unrelated DOM", () => {
    const first = card("https://habr.com/ru/articles/123/?lang=ru");
    const second = card("https://habr.com/ru/company/acme/blog/456/");
    const unrelated = card("https://example.test/article/789");
    const selectors: string[] = [];
    const root = { querySelectorAll: (selector: string) => { selectors.push(selector); return [first, second, unrelated]; } } as unknown as ParentNode;

    expect(articleIdFromCard(first)).toBe(123);
    expect(articleCards(root)).toEqual([first, second]);
    expect(selectors).toEqual([".tm-articles-list__item, .tm-page-article-box, .tm-article-presenter"]);
    expect([...new Set(articleCards(root).map(articleIdFromCard))]).toEqual([123, 456]);
  });
});
