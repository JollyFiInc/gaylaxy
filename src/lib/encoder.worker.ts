import { encodeWebCodecs, loadExportFont } from './encoder-webcodecs';
import type { PcmAudio } from './encoder-common';
import type { ExportProgress, LoadedAssets, VideoConfig } from '../types';

export interface EncoderWorkerRequest { config: VideoConfig; assets: LoadedAssets; audio: PcmAudio | null; fontUrl: string }
export type EncoderWorkerResponse = { type: 'progress'; value: ExportProgress } | { type: 'done'; blob: Blob } | { type: 'error'; message: string; name: string };

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<EncoderWorkerRequest>) => void) | null;
  postMessage: (message: EncoderWorkerResponse) => void;
};

scope.onmessage = async ({ data }) => {
  try {
    await loadExportFont(data.fontUrl);
    const blob = await encodeWebCodecs({ ...data, onProgress: value => scope.postMessage({ type: 'progress', value }) });
    scope.postMessage({ type: 'done', blob });
  } catch (error) {
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error), name: error instanceof Error ? error.name : 'Error' });
  } finally {
    for (const asset of [...data.assets.pfps, data.assets.flag]) {
      if (asset.image instanceof ImageBitmap) asset.image.close();
    }
  }
};
