# Echoes

Echoes is a local-first D&D initiative tracker with an NPC Collection and integrated statblock dice rolling created by **Neil Simpson** — **nomorefaith@gmail.com**.

## Recommended edition: installable PWA

Echoes is packaged as a Progressive Web App so it can be installed on **ChromeOS** and also on Windows, macOS, or Linux through Chrome/Edge. Once installed, it launches from the app launcher in a standalone window and works offline after its first successful load.

PWA installation requires the project to be served from HTTPS (or localhost for development). Opening 'index.html' directly remains useful as a preview, but 'file://' pages cannot install a service worker or become an offline PWA.

## Data safety

Open **Data & backup** inside Echoes and:

1. Install the app.
2. Request persistent storage.
3. Choose the exact external `Echoes-library.json` file in any locally available or synchronised folder.

The external file is updated after changes and survives clearing site data. Use **Resume permission** to reconnect the remembered file handle, or **Choose a different library** when intentionally changing files. Manual complete export/import is also available.

See [HELP.md](HELP.md) for the complete user guide.


## Durable library storage

Browser storage is only a working copy. In the installed Chrome/ChromeOS app, choose the exact external `Echoes-library.json` from **Data & library** in any folder exposed by the system file picker. Echoes loads that file as its authoritative campaign library and mirrors every change to it. If browser data is cleared or Echoes is opened on another Chromebook, reconnect the same file.
