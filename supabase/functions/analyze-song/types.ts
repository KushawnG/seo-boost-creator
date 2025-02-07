
export interface ErrorDetails {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
}

export interface AudioSource {
  url?: string;
  filePath?: string;
}

export interface AnalysisResult {
  key: string;
  bpm: number;
  chords: string[];
}
