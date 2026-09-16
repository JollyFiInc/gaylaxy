# Gaylaxy Maker

Make a “zooming through the gaylaxy” meme with two profile pictures and a Pride flag. Edit the pictures, captions, flight, and soundtrack; preview the animation; then download a video. Everything runs in your browser.

Built with TypeScript, React, Vite, Canvas, and Mediabunny. The default movie is **1080 × 1080, 30 fps, 18.67 seconds**. A 720 × 720 option is available.

## Run locally

Use Node.js 24 and npm. Run these commands from this directory:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Use an HTTP server; opening `index.html` directly from your filesystem will not load the app's modules and workers correctly.

`npm run dev` and `npm run build` automatically run `prepare:assets`, which copies the pinned, single-thread FFmpeg runtime from `node_modules` into `public/encoder`. No separate preparation step is needed after a fresh install. These generated files are ignored by Git and copied into the production build. The main app does not load the roughly 31 MB software encoder until a feature needs it.

Build and inspect the production version:

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

The deployable files are in `dist/`. `npm run preview` is a local build preview, not the production hosting service.

## Make a video

1. Replace **Person 1** and **Person 2** with PNG, JPG, or WebP files, using the file pickers or drag and drop. Each image may be up to 20 MB. The complete image is shown by default; square/circle crops, zoom, and position are optional.
2. Enter names, swap the pictures if needed, and edit any of the five caption phrases. Custom captions reveal in word groups at the template's musical beats.
3. Choose from 23 bundled flags using the searchable picker, or upload a custom flag image. Named variants and credits appear with the catalog.
4. The 18.67-second meme soundtrack is selected by default. In **Sound**, replace it with your own audio/video, remove it for a silent movie, or choose **Use built-in soundtrack** to restore it. Set the source trim point, placement on the movie timeline, and volume. Uploaded video soundtracks are extracted locally.
5. Play, pause, scrub, or jump to a scene. Adjust picture size, flight speed, bobbing, flag size, galaxy brightness, caption size, echoes, and scene timing. Customize the three galaxy colors, the opening background and caption colors, later caption fill/outline, and the selected flag's palette. Color changes appear in preview and video export.
6. Choose **Make my video** to render the movie. Play the finished MP4 in the result card, then download it. Each export gets a distinct filename containing your chosen caption; changing settings immediately removes the old result. Export **MP3** to download only its soundtrack. Export progress includes a Cancel control.

Audio placement follows one rule: at movie time `t`, the source position is `trimStart + t - audioOffset`. A positive offset delays the audio; a negative offset starts further into it. The exported soundtrack is trimmed or padded with silence to match the movie's duration. Audio uploads are limited to 150 MB and 10 minutes.

Flag palette editing works with built-in SVG flags and SVG snapshots restored from project ZIPs. Uploaded PNG/JPG/WebP flags retain their original colors. Choosing a different flag clears the previous flag's replacements; its symbols and shapes stay intact when recolored.

### Save an editable project

Save a project ZIP to continue later, then load that ZIP back into Gaylaxy Maker. It contains versioned settings JSON, both original pictures, the custom flag if present, and the selected soundtrack (the built-in MP3 or your original audio/video upload). A selected built-in flag is included as a separate image snapshot and restored from that snapshot, preserving its appearance even if the catalog changes. Project imports validate settings and enforce a 180 MB archive/uncompressed-media limit.

Color settings and flag color replacements are saved with the project. Existing version-1 project ZIPs created before color editing still load and use the original default colors. New projects retain schema version 1 with the added color settings; older app builds may ignore those new settings, so reopen them in this version to retain the edited appearance.

The ZIP preserves editable inputs and settings; an MP4 is the finished, flattened movie. **OpenShot `.osp` generation is not included in this app version.** That remains a separate follow-on feature; a Gaylaxy Maker project ZIP is not an OpenShot project.

## How rendering and export work

Preview and export call the same deterministic `renderFrame(context, time, config, assets)` function. Preview follows the audio clock when sound is playing. Export explicitly renders `frameIndex / 30`, so rendering speed and display refresh rate do not change the video's timing.

The galaxy uses seeded, cached nebula and star textures. Both pictures remain separate flat image layers, and the flag uses its complete source image. The waving banner preserves its symbols and extends its fly edge to create a longer trail. Caption lines are laid out from the complete phrase so their placement stays stable as words appear. Giant picture echoes enter during the closing scene.

| Export path | Output | Behavior |
| --- | --- | --- |
| Native video encoder | H.264 video + AAC audio in MP4, 720 or 1080 square | Mediabunny checks actual codec support. Uses an OffscreenCanvas worker when available, with a main-thread path otherwise. |
| AAC fallback | AAC audio within the native MP4 export | Loads `@mediabunny/aac-encoder` when the browser lacks an AAC encoder. |
| Full software fallback | H.264 video + AAC audio in MP4, **720 square** | Loads single-thread FFmpeg only when needed. Encodes in short chunks to bound frame memory. The progress display identifies the 720p fallback. |
| Soundtrack download | MP3, audio only | Uses the same trim, offset, duration, and volume settings through local FFmpeg. |

The renderer's motion logic is adapted from the existing HyperFrames composition into browser TypeScript. Running the app requires no HyperFrames CLI, Python, native FFmpeg installation, rendering server, or paid API. Native FFmpeg is used only by the optional developer verification script.

The static runtime is designed to work with `crossOriginIsolated === false`: it does not require `SharedArrayBuffer` or custom COOP/COEP headers. Fonts, flags, encoder files, and workers resolve from the same site under Vite's configured base path.

## Privacy and files

Pictures and soundtracks are processed on the device. The app has no media-upload endpoint, account system, API keys, or analytics. Network requests retrieve the app's static files, built-in soundtrack, and locally hosted encoder dependencies. Private profile pictures and reference videos are excluded from this project. The soundtrack from the project owner's supplied reference is intentionally bundled at their request; see [the soundtrack notice](public/audio/README.md).

Media stays in the current page session until downloaded as a project. Refreshing or closing the page discards unsaved edits. A project ZIP includes the original media, so anyone receiving it can access those files.

## GitHub Pages

Use **the contents of this directory as the repository root**, with `package.json` and `.github/workflows/pages.yml` at the top level. The supplied workflow assumes that layout.

### Publish the source files

Keep `.github/`, `.gitignore`, `src/`, `scripts/`, `tests/`, `public/` (except the generated `public/encoder/` directory), `index.html`, the package and lock files, TypeScript/Vite/Playwright configuration, and this README. Keep the bundled flags, fonts, demos, soundtrack in `public/audio/`, and license files in `public/`; they are source assets needed by the site.

Leave `node_modules/`, `dist/`, `public/encoder/`, test output/reports, coverage, caches, `*.tsbuildinfo`, local environment files, and ZIP downloads out of the repository. `.gitignore` excludes them from Git. If uploading files through GitHub's website, omit these generated files yourself because a browser upload does not apply `.gitignore`. The previous `gaylaxy-maker-source.zip` archive is unnecessary; publish the current source files from this directory. Do not upload the surrounding pictures/reference-video directory.

`npm ci` recreates dependencies; `npm run build` recreates the encoder runtime and the complete `dist/` site. The Pages workflow performs both steps. Generated files can be removed after local verification without losing editable app source.

### Enable Pages

1. Create a repository and add these project files when ready to publish.
2. In the repository's **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source.
3. Use a `main` branch, or update the workflow's branch trigger to match your default branch.
4. Push to `main`, or run the workflow manually from Actions. The workflow installs from the lockfile, runs unit tests, then builds (including encoder preparation and type-checking), uploads `dist`, and deploys it to Pages.

Before Pages is enabled, pushes run tests and build verification only; they do not publish a site or retain a build artifact. Once Pages is configured, the same workflow deploys it and retains its deployment artifact for one day.

The workflow obtains the site's `base_path` from `actions/configure-pages` and passes it to Vite. Repository sites, `<owner>.github.io` sites, and configured custom domains receive the appropriate base automatically. Configure a custom domain in **Settings → Pages**, then run the workflow again so the build uses the updated site path. The workflow's official Actions are pinned to verified release commits. See [Vite's GitHub Pages deployment guide](https://vite.dev/guide/static-deploy.html#github-pages) and [GitHub's publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

To inspect a project-site build locally:

```sh
VITE_BASE_PATH=/gaylaxy-maker/ npm run build
VITE_BASE_PATH=/gaylaxy-maker/ npm run preview
```

Open `http://127.0.0.1:4173/gaylaxy-maker/` using the port printed by Vite. **Use the same `VITE_BASE_PATH` for both build and preview**; a mismatch can produce a blank page. Check flags, video export, and MP3 export there to exercise workers and WASM from the nested path. For a root/custom-domain build, use `/`. If your repository uses a subdirectory instead of the root layout above, update the workflow's working directory, npm cache path, and uploaded `dist` path together.

For a persistent local setting, put `VITE_BASE_PATH=/gaylaxy-maker/` in `.env.local`; both build and preview read it. A command-line environment value overrides that file. Use your actual repository name in place of `gaylaxy-maker`. Paths are normalized to a leading and trailing slash; full domain URLs and relative `./` bases are rejected because export workers need same-origin paths. With no setting, the default is `/`.

To inspect a root/custom-domain build explicitly:

```sh
VITE_BASE_PATH=/ npm run build
VITE_BASE_PATH=/ npm run preview
```

Commit the **source project** to the repository. The workflow creates and uploads the complete Pages artifact from `dist/`; no prebuilt distribution or ZIP archive is needed in Git. A local build made for `/gaylaxy-maker/` must be rebuilt before previewing or hosting it at `/` or a different repository path.

The app is a single page and needs no server rewrite rules. No site is published by running a local build; publishing occurs only when the GitHub workflow is enabled and triggered.

## Verification and browser limits

```sh
npm test
npm run typecheck
npm run build
```

Unit tests cover timeline boundaries, custom captions, deterministic picture motion, flag assets, and audio/export preparation. Checks in **Chromium 152 on Linux** have verified:

- Matching renderer pixels after backward/forward seeks, plus visual inspection of intro, paired setup, flight, and echo scenes.
- Desktop and 390px mobile editor layouts, with no horizontal overflow or browser console errors; `crossOriginIsolated` is `false`.
- Full-length native-worker and forced-software exports: 560 H.264 frames, 720 × 720, 30 fps, 18.666667 seconds, with AAC audio; metadata inspected with `ffprobe`.
- Native 1080 × 1080 exports, with and without OffscreenCanvas: 60 frames over two seconds, with AAC audio.
- MP3 export at the matching duration, audio extraction from an uploaded MP4, cancellation, and successful retry after cancellation.
- The production editor at `/gaylaxy-maker/`: real image/audio uploads, preview, flag changes, trim/offset edits, project ZIP save/reload, a full 560-frame native MP4, MP3 download, cancellation, and a 240-frame software retry.
- Both video encoders preserve two custom captions (checked in decoded frames with OCR), selected intro/text colors, built-in AAC audio, and distinct caption-based download filenames. Finished playback uses the same MP4 as its download, and edited settings clear earlier results.
- All 23 flag palettes expose their original colors; recoloring preserves flag geometry, and project ZIPs restore chosen colors and the built-in soundtrack.
- Decoded audio begins with the chosen 0.5 seconds of silence, then contains audible sound. Project ZIPs preserve both uploaded PNGs byte for byte and include the selected flag SVG snapshot. No JavaScript errors, failed requests, or asset requests outside the configured site path occurred.

Native AAC may include approximately one encoder frame of padding (about 21 ms in the tested output); the video frame count and source audio timeline remain exact. Testing on one browser does not establish compatibility with every browser.

### End-to-end editor test

Install native **FFmpeg** (`ffmpeg` and `ffprobe`), **Tesseract OCR with English language data**, and either Chromium or Playwright's Chromium browser, then run:

```sh
# Only needed if a compatible Chromium is not already installed
npx playwright install chromium
npm run test:e2e
```

The test uses `/usr/bin/chromium` when available, otherwise Playwright's installed browser. Set `CHROMIUM_PATH` for another installation. By default it builds and serves the production app at `/gaylaxy-maker/`, then exercises uploads, preview, flag selection, audio trim, project save/reload, full-length MP4, MP3, and software-export cancellation/retry. Native `ffprobe`, `ffmpeg`, and `tesseract` must be on `PATH`. Check that `tesseract --list-langs` includes `eng`.

The caption regression exports two different custom phrases through both automatic and forced-software encoding, extracts a frame with FFmpeg, and uses Tesseract to check the exported text and absence of the default caption. Run it on its own with:

```sh
npm run test:e2e -- tests/captions.spec.ts
```

To test an already running build:

```sh
BASE_URL=http://127.0.0.1:4177/gaylaxy-maker/ npm run test:e2e
```

Supplying `BASE_URL` skips starting a test server. The Pages workflow runs unit tests; this browser test is a separate local verification command.

### Encoder-only test

The encoder script runs real encodes, extracts audio, checks cancellation/retry, and inspects metadata. It needs Chromium, `ffprobe`, and the Vite development server:

```sh
# In one terminal
npm run dev -- --port 4178

# In another terminal
node scripts/test-encoders.mjs
FULL_ENCODER_TEST=1 node scripts/test-encoders.mjs
```

Set `CHROMIUM_PATH` if Chromium is not at `/usr/bin/chromium`; set `ENCODER_TEST_URL` to change the development-server URL. The full run encodes the default 560-frame duration. Verification output is written under `/tmp/gaylaxy-encoder-test` on Linux.

Practical limits:

- Encoder availability depends on the browser, operating system, and hardware. An unavailable native encoder falls back to software; successful native encoding is not assumed from the browser name alone.
- The software fallback always exports at 720 × 720 and can take substantially longer than playback. It still renders every expected frame. Choose 720p on slower devices.
- The preview uses a smaller backing canvas than a 1080p export. Timing, layout, and motion match; text antialiasing and encoder compression can differ.
- Browser memory limits still apply to large image/audio files, project ZIPs, and exports. Keep the tab open until its download is ready. Background suspension may pause progress, but it does not advance or skip export timestamps.
- Unsupported or soundless audio/video uploads produce a decoding error. Use a common audio format such as MP3 or WAV if the source container cannot be read.
- Safari, Firefox, and mobile browsers have not yet been verified in this delivery. There is no guarantee that every embedded webview supports the required Canvas, font, audio, and download APIs.
- Captions support custom text and emoji, but glyphs unavailable in the bundled font fall back to the device's fonts. They can look different across operating systems.

## Source map

| File | Responsibility |
| --- | --- |
| `src/config.ts`, `src/types.ts` | Defaults and shared project types |
| `src/lib/timeline.ts` | Scene boundaries, caption reveals, and picture motion |
| `src/lib/renderer.ts` | Shared Canvas scene renderer and cached galaxy effects |
| `src/lib/export.ts`, `src/lib/encoder*.ts` | Export coordination, workers, native encoding, and FFmpeg fallback |
| `src/lib/audio.ts`, `src/lib/encoder-common.ts` | Audio decoding, timeline alignment, and MP3 output |
| `src/lib/project.ts`, `src/lib/media.ts` | Project ZIP validation and media loading |
| `src/flags.ts`, `public/flags/` | Extensible flag catalog and bundled vectors |
| `.github/workflows/pages.yml` | GitHub Pages build and deployment |

## Flag and font credits

The 23 flags are individual, documented variants rather than a claim to include every Pride flag. Their original sources, authors, variant names, and licenses are in [FLAGS_LICENSES.md](public/FLAGS_LICENSES.md); [sources.json](public/flags/sources.json) includes file hashes and cleanup details. Add flags through `src/flags.ts`, retain complete symbols, and update both attribution files.

Flag licenses vary. In particular, the bundled demiromantic and omnisexual assets retain CC BY-SA 4.0 terms. MP4 metadata contains the selected flag's attribution and source information. Preserve the applicable credits and license when redistributing the flag or its animated adaptation; see the asset notice for details.

**Comic Neue** supplies the video captions and **DM Sans** supplies the editor interface. Both are bundled locally under the SIL Open Font License 1.1: [Comic Neue license](public/fonts/ComicNeue-OFL.txt), [DM Sans license](public/fonts/DMSans-OFL.txt). Dependency packages retain their own licenses; bundled notices and source/build references are in [THIRD_PARTY_NOTICES.md](public/THIRD_PARTY_NOTICES.md).

The [built-in soundtrack](public/audio/README.md) retains its original rights. The software, font, and flag licenses do not apply to that recording.
