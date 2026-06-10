import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ImproverSettings } from "./clientConfig";
import { ConfigPage } from "./improver/ConfigPage";
import { ImproverPage } from "./improver/ImproverPage";
import { loadSettings, saveSettings } from "./storage";
import "./styles.css";

type Page = "improver" | "config";
type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "speech-improver-theme";

function pageFromHash(): Page {
  return window.location.hash === "#config" ? "config" : "improver";
}

function loadTheme(): Theme {
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function App() {
  const [page, setPage] = useState<Page>(pageFromHash);
  const [settings, setSettings] = useState<ImproverSettings>(loadSettings);
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(loadTheme);

  useEffect(() => {
    const onHashChange = () => {
      setPage(pageFromHash());
      setMenuOpen(false);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      theme === "dark" ? "#101419" : "#f6821f"
    );
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  function handleSave(next: ImproverSettings) {
    saveSettings(next);
    setSettings(next);
    setSettingsVersion((version) => version + 1);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <a href="#" className="brand" onClick={() => setMenuOpen(false)}>
          <span className="brand-mark">S</span>
          <span>
            <span className="brand-title">Speech Improver</span>
            <span className="brand-subtitle">Live checklist coach</span>
          </span>
        </a>
        <div className="header-actions">
          <button
            className="theme-toggle"
            type="button"
            onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            <span className="theme-toggle-thumb" />
            <span>{theme === "dark" ? "Dark" : "Light"}</span>
          </button>
          <button
            className="menu-button"
            type="button"
            aria-label="Menu"
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
        <nav id="primary-navigation" className={menuOpen ? "open" : ""}>
          <a href="#" className={page === "improver" ? "active" : ""}>Trainer</a>
          <a href="#config" className={page === "config" ? "active" : ""}>Einstellungen</a>
        </nav>
      </header>
      <main>
        {page === "improver"
          ? <ImproverPage key={settingsVersion} settings={settings} />
          : <ConfigPage settings={settings} onSave={handleSave} />}
      </main>
      <footer className="app-footer">
        Licensed under GNU GPL v3.0. Copyright (c) 2026 Ahmed Rehman. See LICENSE for details.
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const base = import.meta.env.BASE_URL || "/";
    const serviceWorkerUrl = `${base.endsWith("/") ? base : `${base}/`}sw.js`;
    void navigator.serviceWorker.register(serviceWorkerUrl);
  });
}
