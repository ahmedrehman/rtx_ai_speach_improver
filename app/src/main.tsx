import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ImproverSettings } from "./clientConfig";
import { ConfigPage } from "./improver/ConfigPage";
import { ImproverPage } from "./improver/ImproverPage";
import { loadSettings, saveSettings } from "./storage";
import "./styles.css";

type Page = "improver" | "config";

function pageFromHash(): Page {
  return window.location.hash === "#config" ? "config" : "improver";
}

function App() {
  const [page, setPage] = useState<Page>(pageFromHash);
  const [settings, setSettings] = useState<ImproverSettings>(loadSettings);
  const [settingsVersion, setSettingsVersion] = useState(0);

  useEffect(() => {
    const onHashChange = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function handleSave(next: ImproverSettings) {
    saveSettings(next);
    setSettings(next);
    setSettingsVersion((version) => version + 1);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Speech Improver</h1>
        <nav>
          <a href="#" className={page === "improver" ? "active" : ""}>Trainer</a>
          <a href="#config" className={page === "config" ? "active" : ""}>Einstellungen</a>
        </nav>
      </header>
      <main>
        {page === "improver"
          ? <ImproverPage key={settingsVersion} settings={settings} />
          : <ConfigPage settings={settings} onSave={handleSave} />}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
