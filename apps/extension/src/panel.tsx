import React, { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PublicVote, Summary, VoteKind } from "@ai-slop-labels/api/contracts";
import { browser } from "wxt/browser";
import type { BackgroundResponse } from "./messages.js";
import { panelStyles } from "./styles.js";

const labels: Record<string, string> = { grey: "Не проверено", green: "Человеческий текст", yellow: "Смешанное мнение", red: "Похоже на ИИ" };
const kindLabels: Record<VoteKind, string> = { human: "Человек", partial: "Смешанное", ai: "ИИ" };
const drafts = new Map<number, string>();
let active: { articleId: number; button: HTMLButtonElement } | null = null;
let root: Root | null = null;

async function send(message: unknown): Promise<BackgroundResponse> {
  return browser.runtime.sendMessage(message) as Promise<BackgroundResponse>;
}

function Panel({ articleId, title, close }: { articleId: number; title: string; close: () => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [votes, setVotes] = useState<PublicVote[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [kind, setKind] = useState<VoteKind>("human");
  const [comment, setComment] = useState(drafts.get(articleId) ?? "");
  const [hasOwnVote, setHasOwnVote] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      send({ type: "summary", articleIds: [articleId] }),
      send({ type: "ownVote", articleId }),
      send({ type: "votes", articleId }),
    ]).then(([summaryResponse, ownResponse, votesResponse]) => {
      if (cancelled) return;
      if (summaryResponse.ok && summaryResponse.summaries) setSummary(summaryResponse.summaries[String(articleId)] ?? null);
      if (ownResponse.ok && ownResponse.value && typeof ownResponse.value === "object") {
        setHasOwnVote(true);
        const own = ownResponse.value as { kind?: VoteKind; comment?: string | null };
        if (own.kind) setKind(own.kind);
        setComment(own.comment ?? drafts.get(articleId) ?? "");
      }
      if (votesResponse.ok) {
        setVotes(votesResponse.votes ?? []);
        setNextCursor(votesResponse.nextCursor ?? null);
      }
    });
    return () => { cancelled = true; };
  }, [articleId]);

  useEffect(() => { drafts.set(articleId, comment); }, [articleId, comment]);

  const save = async () => {
    setMessage("Сохраняем…");
    const response = await send({ type: "vote", articleId, kind, comment: comment || null });
    if (!response.ok) {
      setMessage(response.error);
      return;
    }
    const result = response.value as { summary?: Summary } | undefined;
    if (result?.summary) setSummary(result.summary);
    setHasOwnVote(true);
    close();
  };

  const remove = async () => {
    const response = await send({ type: "deleteVote", articleId });
    if (!response.ok) {
      setMessage(response.error);
      return;
    }
    setHasOwnVote(false);
    setKind("human");
    setComment("");
    const result = response.value as { summary?: Summary } | undefined;
    if (result?.summary) setSummary(result.summary);
    setMessage("Голос удалён");
  };

  const loadMore = async () => {
    if (!nextCursor) return;
    const response = await send({ type: "votes", articleId, cursor: nextCursor });
    if (response.ok) {
      setVotes((current) => [...current, ...(response.votes ?? [])]);
      setNextCursor(response.nextCursor ?? null);
    }
  };

  return <section aria-label={`Оценка статьи ${articleId}`}>
    <div className="panel-header"><div><span className="eyebrow">Метка сообщества</span><h2>{title || `Статья ${articleId}`}</h2></div><button className="close" type="button" onClick={close} aria-label="Закрыть панель">×</button></div>
    <div className="score-card"><strong className="score-label">{summary ? labels[summary.label] : "Загрузка оценки…"}</strong><span className="score-total">{summary ? `${summary.total} голосов` : ""}</span></div>
    {summary && <p className="breakdown">Человек: {summary.human} · смешанное: {summary.partial} · ИИ: {summary.ai}</p>}
    <div className="votes"><h3>Оценки сообщества</h3><ul aria-label="Оценки сообщества">{votes.map((vote) => <li key={vote.id}><span className={`vote-kind vote-${vote.kind}`}>{kindLabels[vote.kind]}</span>{vote.user.displayName || vote.user.login} — {vote.comment ?? "без комментария"}</li>)}</ul>{nextCursor && <button className="more" type="button" onClick={() => void loadMore()}>Показать ещё</button>}</div>
    <fieldset><legend>Ваша оценка</legend>{(["human", "partial", "ai"] as const).map((value) => <label key={value}><input type="radio" name={`kind-${articleId}`} checked={kind === value} onChange={() => setKind(value)} /> {kindLabels[value]}</label>)}</fieldset>
    <label className="comment">Комментарий<span className="optional">необязательно</span><textarea value={comment} maxLength={2000} onChange={(event) => setComment(event.target.value)} /></label>
    <div className="actions"><button className="primary" type="button" onClick={() => void save()}>{hasOwnVote ? "Обновить" : "Сохранить оценку"}</button>{hasOwnVote && <button className="danger" type="button" onClick={() => void remove()}>Удалить оценку</button>}</div>
    <p role="status">{message}</p>
  </section>;
}

export function openPanel(articleId: number, button: HTMLButtonElement, title: string): void {
  active?.button.focus();
  active = { articleId, button };
  let host = document.getElementById("ai-slop-labels-panel");
  if (!host) {
    host = document.createElement("aside");
    host.id = "ai-slop-labels-panel";
    host.style.cssText = "position:fixed;inset:0 0 0 auto;width:min(420px,100vw);z-index:2147483647;box-shadow:0 0 18px #0004";
    document.documentElement.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = panelStyles;
    shadow.append(style);
  }
  if (!root) root = createRoot(host.shadowRoot!);
  const close = () => {
    const restoreFocus = active?.button;
    root?.render(null);
    host?.remove();
    root = null;
    active = null;
    restoreFocus?.focus();
  };
  root.render(<Panel articleId={articleId} title={title} close={close} />);
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !active) return;
  const restoreFocus = active.button;
  root?.render(null);
  document.getElementById("ai-slop-labels-panel")?.remove();
  root = null;
  active = null;
  restoreFocus.focus();
});
