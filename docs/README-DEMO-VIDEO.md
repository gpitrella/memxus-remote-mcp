# README demo video (GitHub inline playback)

GitHub's README sanitizer only renders `<video>` tags when `src` points at `https://github.com/user-attachments/assets/...`. External URLs (memxus.com, raw.githubusercontent.com, release assets) are stripped.

## Canonical asset (live)

```
https://github.com/user-attachments/assets/99538f58-e404-4aff-8e9a-c6ea3213fbd3
```

Embedded in [README.md](../README.md). Source: compressed `memxus-demo-readme.mp4` uploaded via GitHub Issue #1.

## GitHub upload limit

Issue/PR drag-and-drop attachments are capped at **10 MB**. The landing master at `Landing-IAMemory/public/memxus-demo.mp4` is ~13 MB and will fail with `Failed to upload`. Compress before upload:

```bash
ffmpeg -i memxus-demo.mp4 -vcodec libx264 -crf 28 -preset slow -vf "scale=1280:-2" -an memxus-demo-readme.mp4
```

Use **PowerShell** on Windows (Git Bash may not see `ffmpeg` immediately after winget install).

## Replacing the demo

1. Re-encode or export a new MP4 under 10 MB.
2. Upload via a [new issue](https://github.com/gpitrella/memxus-remote-mcp/issues/new) (drag-and-drop).
3. Copy the new `user-attachments` URL.
4. Update the `<video src="...">` in [README.md](../README.md).
