import { defineContentScript } from "wxt/utils/define-content-script";
import { browser } from "wxt/browser";
import { articleCards, articleIdFromCard } from "../src/habr.js";
import { openPanel } from "../src/panel.js";
import { getCollapseRed } from "../src/storage.js";
import { labelStyles } from "../src/styles.js";
import type { Summary } from "@ai-slop-labels/api/contracts";

const expanded = new Set<number>();
const hiddenStyles = new WeakMap<Element, string | null>();
let refreshGeneration = 0;
const labelText: Record<Summary["label"], string> = { grey: "Не проверено", green: "Человек", yellow: "Смешанное", red: "Похоже на ИИ" };

function ensureLabelStyles(): void {
  if (document.getElementById("ai-slop-labels-styles")) return;
  const style = document.createElement("style");
  style.id = "ai-slop-labels-styles";
  style.textContent = labelStyles;
  (document.head ?? document.documentElement).append(style);
}

function restore(card: Element): void {
  for (const child of card.children) {
    const previous = hiddenStyles.get(child);
    if (previous === undefined) continue;
    if (previous === null) child.removeAttribute("style");
    else child.setAttribute("style", previous);
    hiddenStyles.delete(child);
  }
  card.removeAttribute("data-ai-slop-collapsed");
}

function setCollapsed(card: Element, value: boolean): void {
  if (!value) {
    restore(card);
    return;
  }
  const title = card.querySelector("h1,h2,h3,.tm-title");
  let keep = title;
  while (keep?.parentElement && keep.parentElement !== card) keep = keep.parentElement;
  for (const child of card.children) {
    if (child === keep || hiddenStyles.has(child)) continue;
    hiddenStyles.set(child, child.getAttribute("style"));
    child.setAttribute("style", "display:none !important");
  }
  card.setAttribute("data-ai-slop-collapsed", "");
}

function label(card: Element, id: number, value: Summary | undefined): void {
  ensureLabelStyles();
  card.classList.add("ai-slop-label-card");
  const heading = card.querySelector("h1,h2,h3,.tm-title");
  const titleClone = heading?.cloneNode(true) as Element | null;
  titleClone?.querySelector("[data-ai-slop-label]")?.remove();
  const title = titleClone?.textContent?.trim() ?? "";
  let button = card.querySelector<HTMLButtonElement>("[data-ai-slop-label]");
  if (!button) {
    button = document.createElement("button");
    button.dataset.aiSlopLabel = "";
    button.type = "button";
  }
  card.append(button);
  button.className = "ai-slop-label";
  button.dataset.label = value?.label ?? "error";
  button.textContent = value ? labelText[value.label] : "Ошибка";
  button.title = value ? `${labelText[value.label]}: ${value.total} голосов` : "Не удалось загрузить оценку";
  button.setAttribute("aria-label", `Открыть оценку статьи ${id}`);
  button.onclick = () => {
    expanded.add(id);
    setCollapsed(card, false);
    openPanel(id, button!, title);
  };
  void getCollapseRed().then((enabled) => setCollapsed(card, enabled && value?.label === "red" && !expanded.has(id)));
}

async function refresh(): Promise<void> {
  const generation = ++refreshGeneration;
  const cards = articleCards();
  const ids = [...new Set(cards.map(articleIdFromCard).filter((id): id is number => id !== null))];
  if (!ids.length) return;
  const response = await browser.runtime.sendMessage({ type: "summary", articleIds: ids }) as { ok: boolean; summaries?: Record<string, Summary> };
  if (generation !== refreshGeneration) return;
  if (!response.ok || !response.summaries) {
    for (const card of cards) {
      const id = articleIdFromCard(card);
      if (id) label(card, id, undefined);
    }
    return;
  }
  for (const card of cards) {
    const id = articleIdFromCard(card);
    if (id) label(card, id, response.summaries[String(id)]);
  }
}

export default defineContentScript({
  matches: ["https://habr.com/*"],
  runAt: "document_idle",
  main() {
    void refresh();
    new MutationObserver(() => void refresh()).observe(document.body, { childList: true, subtree: true });
    browser.storage.local.onChanged.addListener((changes: Record<string, chrome.storage.StorageChange>, area: chrome.storage.AreaName) => {
      if (area === "local" && "local:collapseRed" in changes) void refresh();
    });
  },
});
