export type Framing = 'contain' | 'square' | 'circle';
export interface CropConfig { framing: Framing; zoom: number; x: number; y: number }
export interface VideoColors {
  galaxy: [string, string, string];
  introBackground: string;
  introCaptionFill: string;
  introCaptionAccent: string;
  captionFill: string;
  captionOutline: string;
  flagOverrides: Record<string, string>;
}
export interface VideoConfig {
  schemaVersion: 1;
  duration: number;
  fps: 30;
  resolution: 720 | 1080;
  firstSceneEnd: number;
  launchTime: number;
  echoTime: number;
  name1: string;
  name2: string;
  captions: { intro: string; together: string; names: string; flight: string; ending: string };
  colors: VideoColors;
  crops: [CropConfig, CropConfig];
  pfpScale: number;
  flightSpeed: number;
  bobAmount: number;
  flagScale: number;
  brightness: number;
  captionScale: number;
  showEchoes: boolean;
  flagId: string;
  audioTrimStart: number;
  audioOffset: number;
  volume: number;
}
export interface RasterAsset { image: CanvasImageSource; width: number; height: number }
export interface LoadedAssets { pfps: [RasterAsset, RasterAsset]; flag: RasterAsset }
export interface StoredMedia { name: string; type: string; blob: Blob }
export interface ProjectMedia { pfps: [StoredMedia, StoredMedia]; customFlag: StoredMedia | null; audio: StoredMedia | null }
export interface FlagDefinition {
  id: string; name: string; variant: string; assetPath: string;
  sourceUrl: string; license: string; attribution: string;
}
export interface ExportProgress { fraction: number; stage: string }
export interface ExportOptions {
  config: VideoConfig; assets: LoadedAssets; audio: AudioBuffer | null;
  signal?: AbortSignal; onProgress?: (progress: ExportProgress) => void;
  forceFallback?: boolean;
}
export interface ExportResult { blob: Blob; method: 'webcodecs' | 'ffmpeg'; resolution: 720 | 1080 }
