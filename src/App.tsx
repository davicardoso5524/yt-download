import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";

type VideoMetadata = {
  id: string;
  title: string;
  uploader?: string;
  durationSeconds?: number;
  webpageUrl?: string;
  thumbnail?: string;
};

function App() {
  const [url, setUrl] = useState("");
  const [destinationFolder, setDestinationFolder] = useState("");
  const [status, setStatus] = useState("Pronto para validar URL");
  const [error, setError] = useState("");
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashStep, setSplashStep] = useState(0);

  const splashSteps = [
    "Initializing engine...",
    "Loading yt-dlp...",
    "Checking ffmpeg...",
    "Preparing interface...",
    "Ready.",
  ];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSplashStep((prev) => {
        if (prev >= splashSteps.length - 1) {
          window.clearInterval(timer);
          window.setTimeout(() => setSplashVisible(false), 220);
          return prev;
        }

        return prev + 1;
      });
    }, 420);

    return () => window.clearInterval(timer);
  }, []);

  const isUrlFormatValid = useMemo(() => {
    const value = url.trim().toLowerCase();
    if (!value) {
      return false;
    }

    return (
      (value.startsWith("https://") || value.startsWith("http://")) &&
      (value.includes("youtube.com/") || value.includes("youtu.be/"))
    );
  }, [url]);

  async function pickFolder() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Selecione a pasta de destino",
      });

      if (typeof selected === "string") {
        setDestinationFolder(selected);
      }
    } catch {
      setError("Nao foi possivel abrir o seletor de pastas.");
    }
  }

  async function validateUrl() {
    setError("");
    setMetadata(null);

    if (!isUrlFormatValid) {
      setError("Informe uma URL valida do YouTube (youtube.com ou youtu.be).");
      return;
    }

    if (!destinationFolder.trim()) {
      setError("Selecione uma pasta de destino antes de validar.");
      return;
    }

    setIsValidating(true);
    setStatus("Validando URL e buscando metadados...");

    try {
      const result = await invoke<VideoMetadata>("fetch_video_metadata", {
        url: url.trim(),
      });
      setMetadata(result);
      setStatus("URL valida. Metadados carregados com sucesso.");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus("Falha na validacao da URL.");
    } finally {
      setIsValidating(false);
    }
  }

  const splashPct = Math.min(100, Math.round(((splashStep + 1) / splashSteps.length) * 100));

  if (splashVisible) {
    return (
      <main className="splash-root">
        <div className="splash-grid" />
        <div className="splash-glow" />
        <div className="splash-logo-wrap">
          <span className="splash-logo-stark">STARK</span>
          <span className="splash-logo-pill">TUBE</span>
        </div>
        <p className="splash-tagline">High Performance Extraction</p>
        <div className="splash-loader-wrap">
          <div className="splash-loader-bg">
            <div className="splash-loader-fill" style={{ width: `${splashPct}%` }} />
          </div>
          <p className="splash-status">{splashSteps[splashStep]}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="app-root">
      <header className="topbar">
        <div className="brand">
          <span className="brand-stark">STARK</span>
          <span className="brand-pill">TUBE</span>
        </div>
      </header>

      <section className="hero">
        <h1>Ready to Extract</h1>
        <p>Cole a URL, escolha a pasta e valide o video antes do download.</p>

        <div className="url-box">
          <input
            id="url-input"
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
            placeholder="https://youtube.com/watch?v=..."
            autoComplete="off"
          />
          <button
            type="button"
            className="btn-primary"
            disabled={isValidating}
            onClick={validateUrl}
          >
            {isValidating ? "VALIDANDO" : "ANALISAR"}
          </button>
        </div>

        <div className="folder-row">
          <input
            id="destination-input"
            value={destinationFolder}
            onChange={(e) => setDestinationFolder(e.currentTarget.value)}
            placeholder="Selecione a pasta de destino..."
            autoComplete="off"
          />
          <button type="button" onClick={pickFolder}>
            Escolher pasta
          </button>
        </div>
      </section>

      <section className="download-card">
        <div className="download-header">
          <h2>Download Atual</h2>
          <span className="badge">PRE-CHECK</span>
        </div>

        {metadata ? (
          <div className="video-row">
            {metadata.thumbnail ? (
              <img src={metadata.thumbnail} alt="Thumbnail do video" className="video-thumb" />
            ) : (
              <div className="video-thumb video-thumb-fallback">NO THUMB</div>
            )}
            <div className="video-info">
              <h3>{metadata.title}</h3>
              <p>{metadata.uploader ?? "Canal nao informado"}</p>
              <p>
                Duracao:{" "}
                {metadata.durationSeconds
                  ? `${Math.floor(metadata.durationSeconds / 60)}m ${metadata.durationSeconds % 60}s`
                  : "Nao informada"}
              </p>
            </div>
          </div>
        ) : (
          <p className="empty">Nenhum video validado ainda.</p>
        )}

        <div className="progress-wrap">
          <div className="progress-meta">
            <span>Progresso</span>
            <span>{metadata ? "0%" : "--"}</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: metadata ? "0%" : "0%" }} />
          </div>
        </div>

        <p className="status">Status: {status}</p>
        {error ? <p className="error">Erro: {error}</p> : null}
      </section>
    </main>
  );
}

export default App;
