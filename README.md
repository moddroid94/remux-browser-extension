# m3u8DL Sniffer

A browser video sniffer extension (Chrome / Manifest V3) that detects media resources such as m3u8, mp4, and mpd on web pages and sends them to the N_m3u8DL-RE-WEB-UI remote downloader with one click.

## Features

- 🔍 **Resource Sniffing** - Automatically detects media resources like m3u8, mp4, mpd, etc., on web pages.
- ▶️ **Online Preview** - Directly preview and play m3u8/mp4 resources.
- 📥 **One-Click Download** - Send download tasks to a remote server.
- 🌐 **Proxy Support** - Supports HTTP/HTTPS/SOCKS5 proxies with a quick toggle.
- 🌍 **AI Translation** - Translate video titles using AI.
- 🎨 **Dark Mode** - Automatically syncs with system theme settings.

## How It Works

The extension is only responsible for "sniffing + forwarding links" and does not download videos locally; the actual downloading process is handled by the remote server.

## Quick Start

### 1. Install the Extension

1. Download the [Latest Release](https://github.com/moddroid94/remux-browser-extension/releases).
2. Navigate to `chrome://extensions/` and enable "Developer mode".
3. Click "Load unpacked" and select the extension directory.

### 3. Configure the Extension

Right-click the extension icon → Options → Enter Server URL, Username, and Password → Test Connection → Save.

## Basic Usage

1. Open a web page containing a video.
2. Play the video (to trigger media sniffing).
3. Click the extension icon to view detected resources.
4. Select the resources you want to download.
5. Click "Send to Remote Download".

![Sniffed Resources](images/plugin-sniff-resources.png)


## License

MIT License
