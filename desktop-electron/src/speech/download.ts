/**
 * Model download with progress reporting.
 * Port of desktop/src/speech/download.rs (which uses reqwest).
 */

import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

export interface DownloadProgress {
  percent: number;
  bytesDone: number;
  bytesTotal: number;
}

/**
 * Download a file with progress callbacks.
 * Downloads to `{path}.partial` first, then renames on completion.
 * Follows redirects (HuggingFace uses them).
 */
export function downloadFile(
  url: string,
  destPath: string,
  onProgress: (progress: DownloadProgress) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(destPath)) {
      console.error(`[STT] File already exists: ${destPath}`);
      resolve();
      return;
    }

    const partialPath = destPath + '.partial';

    // Ensure directory exists
    const dir = path.dirname(destPath);
    fs.mkdirSync(dir, { recursive: true });

    console.error(`[STT] Downloading from ${url}`);
    console.error(`[STT] Saving to: ${partialPath}`);

    function doRequest(reqUrl: string, redirectCount = 0) {
      if (redirectCount > 5) {
        reject('Too many redirects');
        return;
      }

      const client = reqUrl.startsWith('https') ? https : http;
      const req = client.get(reqUrl, (res) => {
        // Follow redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          doRequest(res.headers.location, redirectCount + 1);
          return;
        }

        if (!res.statusCode || res.statusCode >= 400) {
          reject(`Download failed with status: ${res.statusCode}`);
          return;
        }

        const totalSize = parseInt(res.headers['content-length'] || '0', 10);
        if (totalSize > 0) {
          console.error(`[STT] File size: ${(totalSize / 1048576).toFixed(1)} MB`);
        }

        const file = fs.createWriteStream(partialPath);
        let downloaded = 0;
        let lastPercent = -1;

        res.on('data', (chunk: Buffer) => {
          file.write(chunk);
          downloaded += chunk.length;

          if (totalSize > 0) {
            const percent = (downloaded / totalSize) * 100;
            if (percent - lastPercent >= 1) {
              lastPercent = percent;
              onProgress({
                percent,
                bytesDone: downloaded,
                bytesTotal: totalSize,
              });
            }
          }
        });

        res.on('end', () => {
          file.end(() => {
            // Rename .partial → final
            try {
              fs.renameSync(partialPath, destPath);
              console.error(`[STT] Download complete: ${destPath}`);

              onProgress({
                percent: 100,
                bytesDone: downloaded,
                bytesTotal: totalSize || downloaded,
              });

              resolve();
            } catch (e) {
              reject(`Failed to rename partial file: ${e}`);
            }
          });
        });

        res.on('error', (e) => {
          file.end();
          try { fs.unlinkSync(partialPath); } catch {}
          reject(`Download error: ${e.message}`);
        });
      });

      req.on('error', (e) => {
        reject(`Request error: ${e.message}`);
      });
    }

    doRequest(url);
  });
}
