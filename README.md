# Echoes

Echoes is a local-first D&D initiative tracker with an NPC Collection and integrated statblock dice rolling created by **Neil Simpson** — **nomorefaith@gmail.com**.

## Open and install Echoes

Echoes is an installable Progressive Web App (PWA). After installation it opens in its own window, appears in your app launcher or Start menu, and works offline after it has loaded successfully once.

Use the Echoes app address, not the GitHub repository page and not a downloaded `index.html` file. The expected address for this project is:

**https://nomorefaith.github.io/Echoes/**

If that address shows a 404 page, Echoes has not yet been published with GitHub Pages. The project owner should complete the one-time publishing steps below.

### One-time publishing setup (project owner only)

1. Sign in to GitHub and open **https://github.com/NoMoreFaith/Echoes**.
2. Select **Settings** near the top of the repository. If it is hidden, open the repository tab menu first.
3. In the left-hand menu, select **Pages** under **Code and automation**.
4. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
5. Set **Branch** to **main**, leave the folder as **/(root)**, and select **Save**.
6. Wait a few minutes, then refresh the Pages settings screen. GitHub will display the published site address when it is ready.
7. Open **https://nomorefaith.github.io/Echoes/** in Chrome and follow the installation steps below.

This setup is only needed once. Later changes pushed to the `main` branch will be published automatically.

### Chromebook / ChromeOS

1. Connect the Chromebook to the internet for the first installation.
2. Open **Chrome**.
3. Type or paste **https://nomorefaith.github.io/Echoes/** into the address bar and press **Enter**.
4. Wait for Echoes to finish loading.
5. Click the **Install** icon at the right-hand end of Chrome's address bar. It looks like a small computer screen with a downward arrow.
6. Click **Install** in the confirmation window.
7. Echoes will open in its own window. In future, open the Chromebook **Launcher**, search for **Echoes**, and select it. You can right-click its launcher icon and choose **Pin to shelf** for quicker access.

If the Install icon is not visible, open Chrome's **three-dot menu** and select **Install Echoes**. Depending on the Chrome version, this option may appear inside **Cast, save and share**.

### Windows, macOS, or Linux using Chrome

1. Open **Google Chrome**.
2. Type or paste **https://nomorefaith.github.io/Echoes/** into the address bar and press **Enter**.
3. Wait for Echoes to finish loading.
4. Click the **Install** icon at the right-hand end of the address bar, then click **Install**.
5. Echoes will open in its own window. On Windows it can then be launched from the **Start menu**; on macOS or Linux it appears with your other installed applications.

If the Install icon is not visible, open Chrome's **three-dot menu** and select **Install Echoes**. Depending on the Chrome version, this option may appear inside **Cast, save and share**.

### Windows using Microsoft Edge

1. Open **Microsoft Edge** and visit **https://nomorefaith.github.io/Echoes/**.
2. Open the **three-dot menu**.
3. Select **Apps**, then **Install Echoes**.
4. Confirm the installation. Echoes will then be available from the Windows **Start menu**.

### Opening a downloaded copy (preview only)

You can double-click `index.html`, or right-click it and choose **Open with > Google Chrome**, to preview Echoes from a downloaded folder. This is not the installed edition: pages opened from `file://` cannot install the offline service worker and will not behave as a full PWA.

## First-time data safety setup

After installing Echoes:

1. Open Echoes and select **Backup** in the left-hand menu. The page title is **Data & library**.
2. Select **Install app** if Echoes reports that the installed edition is not active.
3. Select **Request persistent storage**.
4. Select **Choose Echoes-library.json**.
5. Choose an existing `Echoes-library.json`, or create one in a folder you can access from the Chromebook. A locally synchronised Google Drive folder is suitable.
6. Approve read and write access when Chrome asks.
7. Confirm that Echoes shows **Connected and saving automatically**.

Echoes remembers the selected file and saves changes to it automatically. If Chrome asks again later, use **Resume permission** to reconnect the same file. Use **Choose a different library** only when you intentionally want to change files.

See [HELP.md](HELP.md) for the complete user guide.


## Durable library storage

Browser storage is only a working copy. In the installed Chrome/ChromeOS app, choose the exact external `Echoes-library.json` from **Data & library** in any folder exposed by the system file picker. Echoes loads that file as its authoritative campaign library and mirrors every change to it. If browser data is cleared or Echoes is opened on another Chromebook, reconnect the same file.

## Importing a private 5etools catalogue

Echoes does not publish a bundled monster or spell database. To build your personal offline reference:

1. Connect the authoritative **Echoes-library.json** from **Backup** first.
2. Open **Bestiary** or **Spells**.
3. Select **Import 5etools**.
4. Leave the normal 5etools page link in place, or paste a specific 5etools data-file link.
5. Select **Load source list**, tick only the source books you use, then select **Import selected**.
6. Wait for the confirmation and verify that Backup reports **Last saved successfully**.

Echoes recognises the 5etools link and downloads the matching JSON from the public source repository linked by 5etools. Imported content is copied into your own `Echoes-library.json`; it works offline after import. Refreshing the same source updates only records previously tagged as 5etools imports from that source. It never removes custom monsters, custom spells, local file imports, or records imported from another source.

Source books are deliberately selected rather than all downloaded at once because complete 5etools catalogues can be very large. Use 5etools as a reference for products you own and follow the rules that apply where you live.
