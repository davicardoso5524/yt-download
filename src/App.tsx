import { useEffect, useMemo, useRef, useState } from "react";
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

type DownloadHistoryStatus = "started" | "completed" | "failed";

type DownloadHistoryEntry = {
  id: string;
  url: string;
  title: string;
  destinationFolder: string;
  mediaType: MediaType;
  format: string;
  quality: string;
  status: DownloadHistoryStatus;
  percent: number;
  createdAt: string;
  updatedAt: string;
};

const HISTORY_STORAGE_KEY = "yt_download_history_v1";
const HISTORY_LIMIT = 25;

type DownloadConfig = {
  url: string;
  destinationFolder: string;
  mediaType: MediaType;
  format: string;
  quality: string;
  videoTitle: string;
};

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
  const [historyEntries, setHistoryEntries] = useState<DownloadHistoryEntry[]>([]);
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashStep, setSplashStep] = useState(0);
  const activeHistoryIdRef = useRef<string | null>(null);

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
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as DownloadHistoryEntry[];
      if (Array.isArray(parsed)) {
        setHistoryEntries(parsed.slice(0, HISTORY_LIMIT));
      }
    } catch {
      setHistoryEntries([]);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyEntries));
    } catch {
      // keep UI funcional mesmo se localStorage estiver indisponivel
    }
  }, [historyEntries]);

  useEffect(() => {
    let disposeProgress: (() => void) | undefined;
    let disposeComplete: (() => void) | undefined;
    let disposeError: (() => void) | undefined;

    const updateHistoryEntry = (
      id: string,
      updater: (entry: DownloadHistoryEntry) => DownloadHistoryEntry,
    ) => {
      setHistoryEntries((prev) => {
        const next = prev.map((entry) => (entry.id === id ? updater(entry) : entry));
        return next;
      });
    };

    const setupListeners = async () => {
      disposeProgress = await listen<DownloadProgressEvent>("download-progress", (event) => {
        setIsDownloading(true);
        const percent = Math.max(0, Math.min(100, Number(event.payload.percent) || 0));
        setDownloadPercent(percent);
        if (event.payload.videoTitle) {
          setDownloadTitle(event.payload.videoTitle);
        }

        if (activeHistoryIdRef.current) {
          updateHistoryEntry(activeHistoryIdRef.current, (entry) => ({
            ...entry,
            title: event.payload.videoTitle || entry.title,
            percent,
            updatedAt: new Date().toISOString(),
          }));
        }
      });

      disposeComplete = await listen<DownloadDoneEvent>("download-complete", (event) => {
        setIsDownloading(false);
        setDownloadPercent(100);
        setStatus(event.payload.message);

        if (activeHistoryIdRef.current) {
          updateHistoryEntry(activeHistoryIdRef.current, (entry) => ({
            ...entry,
            status: "completed",
            percent: 100,
            updatedAt: new Date().toISOString(),
          }));
          activeHistoryIdRef.current = null;
        }
      });

      disposeError = await listen<DownloadDoneEvent>("download-error", (event) => {
        setIsDownloading(false);
        setError(event.payload.message);
        setStatus("Falha no download.");

        if (activeHistoryIdRef.current) {
          updateHistoryEntry(activeHistoryIdRef.current, (entry) => ({
            ...entry,
            status: "failed",
            updatedAt: new Date().toISOString(),
          }));
          activeHistoryIdRef.current = null;
        }
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

  function addHistoryEntry(entry: DownloadHistoryEntry) {
    setHistoryEntries((prev) => [entry, ...prev].slice(0, HISTORY_LIMIT));
  }

  async function fetchMetadataFromUrl(nextUrl: string) {
    return invoke<VideoMetadata>("fetch_video_metadata", {
      url: nextUrl.trim(),
    });
  }

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
      const result = await fetchMetadataFromUrl(url);
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

  async function runDownload(config: DownloadConfig) {
    const historyId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const now = new Date().toISOString();

    addHistoryEntry({
      id: historyId,
      url: config.url,
      title: config.videoTitle,
      destinationFolder: config.destinationFolder,
      mediaType: config.mediaType,
      format: config.format,
      quality: config.quality,
      status: "started",
      percent: 0,
      createdAt: now,
      updatedAt: now,
    });

    activeHistoryIdRef.current = historyId;
    setDownloadPercent(0);
    setDownloadTitle(config.videoTitle);
    setIsDownloading(true);
    setStatus("Iniciando download...");

    await invoke("start_download", {
      url: config.url,
      destinationFolder: config.destinationFolder,
      videoTitle: config.videoTitle,
      mediaType: config.mediaType,
      format: config.format,
      quality: config.quality,
    });
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

    try {
      await runDownload({
        url: url.trim(),
        destinationFolder: destinationFolder.trim(),
        videoTitle: metadata.title,
        mediaType,
        format: mediaType === "video" ? videoFormat : audioFormat,
        quality: mediaType === "video" ? videoQuality : audioQuality,
      });
    } catch (err) {
      activeHistoryIdRef.current = null;
      setIsDownloading(false);
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus("Falha ao iniciar download.");
    }
  }

  function applyHistoryEntry(entry: DownloadHistoryEntry) {
    setUrl(entry.url);
    setDestinationFolder(entry.destinationFolder);
    setMediaType(entry.mediaType);

    if (entry.mediaType === "video") {
      setVideoFormat(entry.format);
      setVideoQuality(entry.quality);
    } else {
      setAudioFormat(entry.format);
      setAudioQuality(entry.quality);
    }

    setDownloadTitle(entry.title);
    setDownloadPercent(entry.percent);
    setStatus("Configuracao carregada do historico.");
  }

  async function redownloadFromHistory(entry: DownloadHistoryEntry) {
    if (isDownloading) {
      return;
    }

    applyHistoryEntry(entry);
    setError("");
    setStatus("Revalidando item do historico...");

    try {
      const result = await fetchMetadataFromUrl(entry.url);
      setMetadata(result);

      await runDownload({
        url: entry.url,
        destinationFolder: entry.destinationFolder,
        mediaType: entry.mediaType,
        format: entry.format,
        quality: entry.quality,
        videoTitle: result.title,
      });
    } catch (err) {
      activeHistoryIdRef.current = null;
      setIsDownloading(false);
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus("Falha ao repetir download do historico.");
    }
  }

  function formatHistoryTime(value: string) {
    try {
      return new Date(value).toLocaleString("pt-BR");
    } catch {
      return value;
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

      <section className="history-card">
        <div className="download-header">
          <h2>Historico de Downloads</h2>
          <span className="badge">{historyEntries.length} ITEM(NS)</span>
        </div>

        {historyEntries.length === 0 ? (
          <p className="empty">Nenhum download salvo ainda.</p>
        ) : (
          <div className="history-list">
            {historyEntries.map((entry) => (
              <article key={entry.id} className="history-item">
                <div className="history-item-top">
                  <h3>{entry.title}</h3>
                  <span className={`status-chip status-${entry.status}`}>
                    {entry.status === "completed"
                      ? "Concluido"
                      : entry.status === "failed"
                        ? "Falhou"
                        : "Em andamento"}
                  </span>
                </div>

                <p className="history-meta">{entry.url}</p>
                <p className="history-meta">
                  {entry.mediaType === "video" ? "Video" : "Audio"} / {entry.format.toUpperCase()} /{" "}
                  {entry.mediaType === "video" ? `${entry.quality}p` : `${entry.quality} kbps`}
                </p>
                <p className="history-meta">Destino: {entry.destinationFolder}</p>
                <p className="history-meta">Atualizado em: {formatHistoryTime(entry.updatedAt)}</p>

                <div className="history-actions">
                  <button type="button" onClick={() => applyHistoryEntry(entry)} disabled={isDownloading}>
                    Usar configuracao
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => redownloadFromHistory(entry)}
                    disabled={isDownloading}
                  >
                    Baixar novamente
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
