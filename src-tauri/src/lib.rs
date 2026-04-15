use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoMetadata {
    id: String,
    title: String,
    uploader: Option<String>,
    duration_seconds: Option<u64>,
    webpage_url: Option<String>,
    thumbnail: Option<String>,
}

#[derive(Debug)]
struct ProcessOutput {
    status_ok: bool,
    stdout: String,
    stderr: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RawYtDlpJson {
    id: Option<String>,
    title: Option<String>,
    uploader: Option<String>,
    duration: Option<u64>,
    webpage_url: Option<String>,
    thumbnail: Option<String>,
}

fn is_valid_youtube_url(url: &str) -> bool {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return false;
    }

    let lower = trimmed.to_ascii_lowercase();
    (lower.starts_with("https://") || lower.starts_with("http://"))
        && (lower.contains("youtube.com/") || lower.contains("youtu.be/"))
}

fn candidate_paths(tool_name: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let executable = if cfg!(windows) {
        format!("{}.exe", tool_name)
    } else {
        tool_name.to_string()
    };

    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("tools").join("bin").join("windows").join(&executable));
        candidates.push(cwd.join("tools").join("bin").join(&executable));
        candidates.push(cwd.join("bin").join(&executable));
    }

    if let Ok(exe_path) = std::env::current_exe()
        && let Some(exe_dir) = exe_path.parent()
    {
        candidates.push(
            exe_dir
                .join("tools")
                .join("bin")
                .join("windows")
                .join(&executable),
        );
        candidates.push(exe_dir.join(&executable));
    }

    candidates
}

fn run_process(executable: &str, args: &[&str]) -> Result<ProcessOutput, String> {
    let output = Command::new(executable)
        .args(args)
        .output()
        .map_err(|err| format!("Falha ao executar '{}': {}", executable, err))?;

    Ok(ProcessOutput {
        status_ok: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

fn resolve_executable(tool_name: &str) -> Result<String, String> {
    for path in candidate_paths(tool_name) {
        if path.exists() {
            let executable = path.to_string_lossy().to_string();
            if run_process(&executable, &["--version"]).is_ok() {
                return Ok(executable);
            }
        }
    }

    if run_process(tool_name, &["--version"]).is_ok() {
        return Ok(tool_name.to_string());
    }

    Err(format!(
        "Nao foi possivel localizar '{}' no PATH ou em tools/bin.",
        tool_name
    ))
}

#[tauri::command]
async fn fetch_video_metadata(url: String) -> Result<VideoMetadata, String> {
    if !is_valid_youtube_url(&url) {
        return Err("URL invalida: informe um link do YouTube (youtube.com ou youtu.be).".to_string());
    }

    let yt_dlp = resolve_executable("yt-dlp")?;
    let url_clone = url.clone();

    let output = tauri::async_runtime::spawn_blocking(move || {
        run_process(
            &yt_dlp,
            &["--dump-single-json", "--skip-download", "--no-playlist", &url_clone],
        )
    })
    .await
    .map_err(|err| format!("Falha na task de validacao: {}", err))??;

    if !output.status_ok {
        let message = if output.stderr.trim().is_empty() {
            "Falha ao validar URL no yt-dlp.".to_string()
        } else {
            format!("yt-dlp retornou erro: {}", output.stderr.trim())
        };
        return Err(message);
    }

    let raw: RawYtDlpJson = serde_json::from_str(&output.stdout)
        .map_err(|err| format!("Falha ao ler resposta do yt-dlp: {}", err))?;

    let id = raw.id.unwrap_or_default();
    let title = raw.title.unwrap_or_default();

    if id.is_empty() || title.is_empty() {
        return Err("Nao foi possivel extrair metadados basicos do video.".to_string());
    }

    Ok(VideoMetadata {
        id,
        title,
        uploader: raw.uploader,
        duration_seconds: raw.duration,
        webpage_url: raw.webpage_url,
        thumbnail: raw.thumbnail,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![fetch_video_metadata])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
