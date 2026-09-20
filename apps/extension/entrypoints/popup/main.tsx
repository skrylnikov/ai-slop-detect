import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import { getCollapseRed, setCollapseRed } from "../../src/storage.js";
import "./style.css";

function Popup() {
  const [collapseRed, setCollapse] = useState(false);
  const [account, setAccount] = useState("Проверяем вход…");
  const [authenticated, setAuthenticated] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  const login = async () => {
    setLoggingIn(true);
    const response = await browser.runtime.sendMessage({ type: "login" }) as { ok: boolean; error?: string };
    setAuthenticated(response.ok);
    setAccount(response.ok ? "Вход выполнен через GitHub" : response.error ?? "Вход не выполнен");
    setLoggingIn(false);
  };

  useEffect(() => {
    void getCollapseRed().then(setCollapse);
    void browser.runtime.sendMessage({ type: "me" }).then((response: { ok: boolean; value?: { displayName?: string } }) => {
      setAuthenticated(response.ok);
      setAccount(response.ok ? `Выполнен вход: ${response.value?.displayName ?? "GitHub"}` : "Вход через GitHub");
    });
  }, []);

  return <main className="popup">
    <h1>Метки AI Slop</h1>
    <p className="account">{account}</p>
    {!authenticated && <button className="primary" type="button" disabled={loggingIn} onClick={() => void login()}>{loggingIn ? "Открываем GitHub…" : "Войти через GitHub"}</button>}
    <label className="setting">
      <input type="checkbox" checked={collapseRed} onChange={(event) => { setCollapse(event.target.checked); void setCollapseRed(event.target.checked); }} />
      <span>Сворачивать статьи с меткой «Похоже на ИИ»</span>
    </label>
    <button className="secondary" type="button" onClick={() => void browser.runtime.sendMessage({ type: "logout" }).then((response: { ok: boolean }) => {
      if (response.ok) { setAuthenticated(false); setAccount("Вход через GitHub"); }
    })}>Выйти</button>
  </main>;
}

createRoot(document.getElementById("app")!).render(<Popup />);
