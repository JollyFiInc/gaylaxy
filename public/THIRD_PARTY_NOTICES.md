# Third-party software notices

Gaylaxy Maker uses the runtime packages below. Versions match the installed dependencies recorded in `package-lock.json`. Original license texts and copyright notices are preserved in [licenses/](licenses/); flag artwork has separate [credits](FLAGS_LICENSES.md).

## JavaScript packages

| Package | Version | License and notices | Source at the installed release |
| --- | --- | --- | --- |
| React | 19.3.0 | [MIT](licenses/react-LICENSE.txt) — Meta Platforms, Inc. and affiliates | [React source](https://github.com/react/react/tree/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react) |
| ReactDOM | 19.3.0 | [MIT](licenses/react-dom-LICENSE.txt) — Meta Platforms, Inc. and affiliates | [ReactDOM source](https://github.com/react/react/tree/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-dom) |
| Scheduler, used by ReactDOM | 0.28.0 | [MIT](licenses/scheduler-LICENSE.txt) — Meta Platforms, Inc. and affiliates | [Scheduler source](https://github.com/react/react/tree/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/scheduler) |
| Lucide React | 1.46.0 | [ISC and Feather notices](licenses/lucide-react-LICENSE.txt) — Lucide Icons and Contributors; derived icons retain the included Feather attribution | [Lucide source](https://github.com/lucide-icons/lucide/tree/7eb8afe2f8b11bf199e6335c2c094a3d1bfedcc2/packages/lucide-react) |
| fflate | 0.8.3 | [MIT](licenses/fflate-LICENSE.txt) — Arjun Barrett | [fflate source](https://github.com/101arrowz/fflate/tree/dcb3714a6c25db3a2748641019c5277413d09714) |
| Mediabunny | 1.56.2 | [MPL-2.0](licenses/mediabunny-LICENSE.txt) — Vanilagy and contributors | [Mediabunny source](https://github.com/Vanilagy/mediabunny/tree/f48609437864d569dfd2e853396a7236a46ab0d5/src) |
| `@mediabunny/aac-encoder` | 1.56.2 | [MPL-2.0](licenses/mediabunny-aac-encoder-LICENSE.txt) — Vanilagy and contributors; embedded FFmpeg is described below | [AAC encoder source and build artifacts](https://github.com/Vanilagy/mediabunny/tree/f48609437864d569dfd2e853396a7236a46ab0d5/packages/aac-encoder) |
| `@ffmpeg/ffmpeg` JavaScript wrapper | 0.12.15 | [MIT](licenses/ffmpeg-wrapper-LICENSE.txt) — Copyright (c) 2019 Jerome Wu | [Wrapper source](https://github.com/ffmpegwasm/ffmpeg.wasm/tree/71aa99d37c02a7b4c435275ca9ef50e612f6efa1/packages/ffmpeg) |

Mediabunny and its AAC extension preserve this source notice:

> Copyright (c) 2026-present, Vanilagy and contributors
>
> This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

The source links above provide the MPL-covered source files. Gaylaxy Maker uses the published packages without local changes to their source files.

## AAC extension: embedded FFmpeg

The AAC extension contains a WebAssembly build of FFmpeg's AAC encoder, linked from `libavcodec` and `libavutil`. Its [original package README](licenses/mediabunny-aac-encoder-README.md) is preserved, including the configure flags and bridge build commands. The extension's JavaScript/bridge is MPL-2.0; FFmpeg's LGPL terms are separate: [LGPL version 2.1 text](licenses/ffmpeg-COPYING.LGPLv2.1.txt), [FFmpeg licensing information](https://ffmpeg.org/legal.html), and [FFmpeg source](https://github.com/FFmpeg/FFmpeg).

The [release source](https://github.com/Vanilagy/mediabunny/tree/f48609437864d569dfd2e853396a7236a46ab0d5/packages/aac-encoder) contains the bridge and committed WASM build. The published README does not identify the exact FFmpeg commit used for that embedded build; no exact FFmpeg revision is asserted here. The documented build enables only AAC encoding and does not enable GPL components.

## FFmpeg software export core

The single-thread `@ffmpeg/core` **0.12.10** package declares **GPL-2.0-or-later**. Its license differs from the JavaScript wrapper's MIT license. Preserve the [GPL version 2 text](licenses/ffmpeg-core-COPYING.GPLv2.txt) and [FFmpeg license/component notice](licenses/ffmpeg-core-LICENSE.md). FFmpeg copyright belongs to the FFmpeg developers and the contributors identified in its source files.

The verified upstream release tag is **`v12.15`**, commit [`71aa99d37c02a7b4c435275ca9ef50e612f6efa1`](https://github.com/ffmpegwasm/ffmpeg.wasm/tree/71aa99d37c02a7b4c435275ca9ef50e612f6efa1). Its [core package metadata](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/71aa99d37c02a7b4c435275ca9ef50e612f6efa1/packages/core/package.json) specifies core 0.12.10. The similarly named `v0.12.10` tag corresponds to an older core and is not used as this package's source reference.

Source and build references:

- [FFmpeg n5.1.4 source](https://github.com/FFmpeg/FFmpeg/tree/n5.1.4), selected by the upstream Dockerfile.
- [FFmpeg.wasm source, bindings and build scripts](https://github.com/ffmpegwasm/ffmpeg.wasm/tree/71aa99d37c02a7b4c435275ca9ef50e612f6efa1).
- Preserved [Dockerfile](licenses/ffmpeg-core-Dockerfile.txt), [FFmpeg configure/build script](licenses/ffmpeg-core-build.txt), and [WASM linker script](licenses/ffmpeg-core-wasm-build.txt). The recipe uses Emscripten 3.1.40 and enables GPL, x264 and x265, among other libraries.
- [Upstream URLs for preserved files](licenses/upstream-files.json) and [embedded library notice/source links](licenses/ffmpeg-core-library-sources.json).

The library references below are the refs named by the upstream build recipe. Some upstream inputs are branches (`4-cores`, `master`), so these are build/source references rather than a claim that upstream records immutable commits for every linked library.

| Embedded library | Preserved notices | Source from build recipe |
| --- | --- | --- |
| x264 | [COPYING](licenses/ffmpeg-core-x264-COPYING) | [Source](https://github.com/ffmpegwasm/x264/tree/4-cores) |
| x265 | [COPYING](licenses/ffmpeg-core-x265-COPYING) | [Source](https://github.com/ffmpegwasm/x265/tree/3.4) |
| libvpx | [LICENSE](licenses/ffmpeg-core-libvpx-LICENSE), [PATENTS](licenses/ffmpeg-core-libvpx-PATENTS) | [Source](https://github.com/ffmpegwasm/libvpx/tree/v1.13.1) |
| lame | [COPYING](licenses/ffmpeg-core-lame-COPYING) | [Source](https://github.com/ffmpegwasm/lame/tree/master) |
| ogg | [COPYING](licenses/ffmpeg-core-ogg-COPYING) | [Source](https://github.com/ffmpegwasm/Ogg/tree/v1.3.4) |
| theora | [COPYING](licenses/ffmpeg-core-theora-COPYING) | [Source](https://github.com/ffmpegwasm/theora/tree/v1.1.1) |
| opus | [COPYING](licenses/ffmpeg-core-opus-COPYING) | [Source](https://github.com/ffmpegwasm/opus/tree/v1.3.1) |
| vorbis | [COPYING](licenses/ffmpeg-core-vorbis-COPYING) | [Source](https://github.com/ffmpegwasm/vorbis/tree/v1.3.3) |
| zlib | [README](licenses/ffmpeg-core-zlib-README) | [Source](https://github.com/ffmpegwasm/zlib/tree/v1.2.11) |
| libwebp | [COPYING](licenses/ffmpeg-core-libwebp-COPYING), [PATENTS](licenses/ffmpeg-core-libwebp-PATENTS) | [Source](https://github.com/ffmpegwasm/libwebp/tree/v1.3.2) |
| freetype | [LICENSE.TXT](licenses/ffmpeg-core-freetype-LICENSE.TXT), [FTL.TXT](licenses/ffmpeg-core-freetype-FTL.TXT), [GPLv2.TXT](licenses/ffmpeg-core-freetype-GPLv2.TXT) | [Source](https://github.com/ffmpegwasm/freetype2/tree/VER-2-10-4) |
| fribidi | [COPYING](licenses/ffmpeg-core-fribidi-COPYING) | [Source](https://github.com/fribidi/fribidi/tree/v1.0.9) |
| harfbuzz | [COPYING](licenses/ffmpeg-core-harfbuzz-COPYING) | [Source](https://github.com/harfbuzz/harfbuzz/tree/5.2.0) |
| libass | [COPYING](licenses/ffmpeg-core-libass-COPYING) | [Source](https://github.com/libass/libass/tree/0.15.0) |
| zimg | [COPYING](licenses/ffmpeg-core-zimg-COPYING) | [Source](https://github.com/sekrit-twc/zimg/tree/release-3.0.5) |

License files copied from installed packages retain their full original text, including secondary notices. FFmpeg's missing npm license files and its linked-library notices were retrieved from the upstream sources above on 2026-09-15. This directory contains notices and small build instructions; the linked repositories provide source code.
