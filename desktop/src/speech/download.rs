use std::path::Path;
use tauri::{AppHandle, Emitter};

use super::DownloadProgressPayload;

/// Download a whisper model file with progress reporting.
///
/// Downloads to `{path}.partial` first, then renames on completion.
/// Emits `stt://download-progress` events during download.
pub async fn download_model(app: AppHandle, url: &str, path: &Path) -> Result<(), String> {
    // Check if already downloaded
    if path.exists() {
        eprintln!("[STT] Model already exists: {}", path.display());
        return Ok(());
    }

    let partial_path = path.with_extension("bin.partial");

    eprintln!("[STT] Downloading model from {url}");
    eprintln!("[STT] Saving to: {}", partial_path.display());

    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download request failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed with status: {}",
            response.status()
        ));
    }

    let total_size = response.content_length().unwrap_or(0);
    eprintln!("[STT] Model size: {:.1} MB", total_size as f64 / 1_048_576.0);

    // Stream response body to file
    let mut file = tokio::fs::File::create(&partial_path)
        .await
        .map_err(|e| format!("Failed to create file: {e}"))?;

    let mut downloaded: u64 = 0;
    let mut last_percent: f32 = -1.0;
    let mut stream = response.bytes_stream();

    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {e}"))?;

        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Write error: {e}"))?;

        downloaded += chunk.len() as u64;

        // Emit progress every 1%
        if total_size > 0 {
            let percent = (downloaded as f32 / total_size as f32) * 100.0;
            if (percent - last_percent) >= 1.0 {
                last_percent = percent;
                let _ = app.emit(
                    "stt://download-progress",
                    DownloadProgressPayload {
                        percent,
                        bytes_done: downloaded,
                        bytes_total: total_size,
                    },
                );
            }
        }
    }

    file.flush()
        .await
        .map_err(|e| format!("Flush error: {e}"))?;

    // Rename .partial → .bin
    tokio::fs::rename(&partial_path, path)
        .await
        .map_err(|e| format!("Failed to rename partial file: {e}"))?;

    eprintln!("[STT] Model download complete: {}", path.display());

    // Emit 100% completion
    let _ = app.emit(
        "stt://download-progress",
        DownloadProgressPayload {
            percent: 100.0,
            bytes_done: downloaded,
            bytes_total: total_size,
        },
    );

    Ok(())
}
