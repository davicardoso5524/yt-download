import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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

type DownloadProgressEvent = {
  videoTitle: string;
  percent: number;
  rawLine: string;
};

type DownloadDoneEvent = {
  message: string;
};

type MediaType = "video" | "audio";

function App() {
  const [url, setUrl] = useState("");
  const [destinationFolder, setDestinationFolder] = useState("");
  const [status, setStatus] = useState("Pronto para validar URL");
  const [error, setError] = useState("");
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [downloadTitle, setDownloadTitle] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>("video");
  const [videoFormat, setVideoFormat] = useState("mp4");
  const [audioFormat, setAudioFormat] = useState("mp3");
  const [videoQuality, setVideoQuality] = useState("1080");
  const [audioQuality, setAudioQuality] = useState("192");
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

  useEffect(() => {
    let disposeProgress: (() => void) | undefined;
    let disposeComplete: (() => void) | undefined;
    let disposeError: (() => void) | undefined;

    const setupListeners = async () => {
      disposeProgress = await listen<DownloadProgressEvent>("download-progress", (event) => {
        setIsDownloading(true);
        setDownloadPercent(Math.max(0, Math.min(100, Number(event.payload.percent) || 0)));
        if (event.payload.videoTitle) {
          setDownloadTitle(event.payload.videoTitle);
        }
      });

      disposeComplete = await listen<DownloadDoneEvent>("download-complete", (event) => {
        setIsDownloading(false);
        setDownloadPercent(100);
        setStatus(event.payload.message);
      });

      disposeError = await listen<DownloadDoneEvent>("download-error", (event) => {
        setIsDownloading(false);
        setError(event.payload.message);
        setStatus("Falha no download.");
      });
    };

    setupListeners();

    return () => {
      if (disposeProgress) {
        disposeProgress();
      }
      if (disposeComplete) {
        disposeComplete();
      }
      if (disposeError) {
        disposeError();
      }
    };
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

  async function startDownload() {
    setError("");

    if (!metadata) {
      setError("Valide uma URL primeiro para iniciar o download.");
      return;
    }

    if (!destinationFolder.trim()) {
      setError("Selecione uma pasta de destino antes do download.");
      return;
    }

    setDownloadPercent(0);
    setDownloadTitle(metadata.title);
    setIsDownloading(true);
    setStatus("Iniciando download...");

    try {
      await invoke("start_download", {
        url: url.trim(),
        destinationFolder: destinationFolder.trim(),
        videoTitle: metadata.title,
        mediaType,
        format: mediaType === "video" ? videoFormat : audioFormat,
        quality: mediaType === "video" ? videoQuality : audioQuality,
      });
    } catch (err) {
      setIsDownloading(false);
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus("Falha ao iniciar download.");
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

        <div className="options-grid">
          <label>
            Tipo
            <select
              value={mediaType}
              onChange={(event) => setMediaType(event.currentTarget.value as MediaType)}
              disabled={isDownloading}
            >
              <option value="video">Video</option>
              <option value="audio">Somente audio</option>
            </select>
          </label>

          {mediaType === "video" ? (
            <>
              <label>
                Formato
                <select
                  value={videoFormat}
                  onChange={(event) => setVideoFormat(event.currentTarget.value)}
                  disabled={isDownloading}
                >
                  <option value="mp4">MP4</option>
                  <option value="mkv">MKV</option>
                  <option value="webm">WEBM</option>
                </select>
              </label>

              <label>
                Qualidade
                <select
                  value={videoQuality}
                  onChange={(event) => setVideoQuality(event.currentTarget.value)}
                  disabled={isDownloading}
                >
                  <option value="2160">4K</option>
                  <option value="1440">1440p</option>
                  <option value="1080">1080p</option>
                  <option value="720">720p</option>
                  <option value="480">480p</option>
                  <option value="360">360p</option>
                  <option value="240">240p</option>
                  <option value="144">144p</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <label>
                Formato
                <select
                  value={audioFormat}
                  onChange={(event) => setAudioFormat(event.currentTarget.value)}
                  disabled={isDownloading}
                >
                  <option value="mp3">MP3</option>
                  <option value="m4a">M4A</option>
                  <option value="opus">OPUS</option>
                </select>
              </label>

              <label>
                Qualidade
                <select
                  value={audioQuality}
                  onChange={(event) => setAudioQuality(event.currentTarget.value)}
                  disabled={isDownloading}
                >
                  <option value="320">320 kbps</option>
                  <option value="256">256 kbps</option>
                  <option value="192">192 kbps</option>
                  <option value="128">128 kbps</option>
                  <option value="64">64 kbps</option>
                </select>
              </label>
            </>
          )}
        </div>
      </section>

      <section className="download-card">
        <div className="download-header">
          <h2>Download Atual</h2>
          <span className="badge">{isDownloading ? "DOWNLOADING" : "READY"}</span>
        </div>

        {metadata || downloadTitle ? (
          <div className="video-row">
            {metadata?.thumbnail ? (
              <img src={metadata.thumbnail} alt="Thumbnail do video" className="video-thumb" />
            ) : (
              <div className="video-thumb video-thumb-fallback">NO THUMB</div>
            )}
            <div className="video-info">
              <h3>{downloadTitle || metadata?.title}</h3>
            </div>
          </div>
        ) : (
          <p className="empty">Nenhum video validado ainda.</p>
        )}

        <div className="progress-wrap">
          <div className="progress-meta">
            <span>Progresso</span>
            <span>{metadata || downloadTitle ? `${downloadPercent.toFixed(1)}%` : "--"}</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${downloadPercent}%` }} />
          </div>
        </div>

        <button
          type="button"
          className="btn-primary download-button"
          onClick={startDownload}
          disabled={isDownloading || !metadata}
        >
          {isDownloading ? "BAIXANDO..." : "INICIAR DOWNLOAD"}
        </button>

        <p className="status">Status: {status}</p>
        <p className="status">
          Configuracao: {mediaType === "video" ? "Video" : "Audio"} /{" "}
          {mediaType === "video" ? videoFormat.toUpperCase() : audioFormat.toUpperCase()} /{" "}
          {mediaType === "video" ? `${videoQuality}p` : `${audioQuality} kbps`}
        </p>
        {error ? <p className="error">Erro: {error}</p> : null}
      </section>
    </main>
  );
}

export default App;
