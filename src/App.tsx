import { useMemo, useState } from "react";
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

  return (
    <main className="container">
      <section className="card">
        <h1>YouTube Downloader</h1>
        <p className="subtitle">Parte 1: validacao de URL e pasta de destino</p>

        <label htmlFor="url-input">URL do YouTube</label>
        <input
          id="url-input"
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          autoComplete="off"
        />

        <label htmlFor="destination-input">Pasta de destino</label>
        <div className="row">
          <input
            id="destination-input"
            value={destinationFolder}
            onChange={(e) => setDestinationFolder(e.currentTarget.value)}
            placeholder="Selecione uma pasta..."
            autoComplete="off"
          />
          <button type="button" onClick={pickFolder}>
            Escolher pasta
          </button>
        </div>

        <button
          type="button"
          className="primary"
          disabled={isValidating}
          onClick={validateUrl}
        >
          {isValidating ? "Validando..." : "Validar URL"}
        </button>

        <p className="status">Status: {status}</p>
        {error ? <p className="error">Erro: {error}</p> : null}

        {metadata ? (
          <div className="metadata">
            <h2>Metadados do video</h2>
            <p>
              <strong>Titulo:</strong> {metadata.title}
            </p>
            <p>
              <strong>Canal:</strong> {metadata.uploader ?? "Nao informado"}
            </p>
            <p>
              <strong>Duracao:</strong>{" "}
              {metadata.durationSeconds
                ? `${Math.floor(metadata.durationSeconds / 60)}m ${metadata.durationSeconds % 60}s`
                : "Nao informada"}
            </p>
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default App;
