# README demo video (GitHub inline playback)

GitHub's README sanitizer only renders `<video>` tags when `src` points at `https://github.com/user-attachments/assets/...`. External URLs (memxus.com, raw.githubusercontent.com, release assets) are stripped.

## One-time upload

1. Open [New issue](https://github.com/gpitrella/memxus-remote-mcp/issues/new) on this repo.
2. Drag `memxus-demo.mp4` (~13 MB) from [Landing-IAMemory/public/memxus-demo.mp4](../../Landing-IAMemory/public/memxus-demo.mp4) into the issue editor.
3. Wait for upload; copy the generated URL, e.g. `https://github.com/user-attachments/assets/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`.
4. Close the issue without submitting (the URL stays valid).

## Update README

Replace the hero `<a><img>...</a>` block in [README.md](../README.md) with:

```html
<div align="center">
  <video src="https://github.com/user-attachments/assets/YOUR-UUID-HERE" width="100%" autoplay muted loop playsinline controls>
    <a href="https://www.memxus.com/demo">Watch the Memxus demo</a>
  </video>
  <br>
  <sub><a href="https://www.memxus.com/demo">Demo page</a> · <a href="https://www.memxus.com/memxus-demo.mp4">Direct MP4</a></sub>
</div>
```

Remove the HTML comment above the block after swapping.
