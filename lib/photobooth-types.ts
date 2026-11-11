export type JobStatus = "queued" | "processing" | "ready" | "displaying" | "done" | "failed" | "skipped";
export type PhotoboothMode = "demo" | "live";
export type PortraitStyle = "beskap" | "kebaya" | "jas" | "batik" | "kebaya-kasual" | "retro-festival";
export type PosterTheme = "nusantara" | "kolase";

export interface Job {
  id: string;
  name: string;
  status: JobStatus;
  mode: PhotoboothMode;
  isSample: boolean;
  portraitStyle: PortraitStyle | "legacy";
  posterTheme: PosterTheme;
  originalUrl: string;
  resultUrl: string | null;
  error: string | null;
  createdAt: number;
  readyAt: number | null;
  displayedAt: number | null;
  completedAt: number | null;
}

export interface Settings {
  eventName: string;
  theme: string;
  accepting: boolean;
  paused: boolean;
  durationSeconds: number;
}

export interface ScreenState {
  connected: boolean;
  sessionId: string | null;
  currentJobId: string | null;
  startedAt: number | null;
  endsAt: number | null;
  lastSeenAt: number | null;
}

export interface StateResponse {
  /** Server clock anchor for monotonic client countdowns. Epoch milliseconds. */
  serverNow: number;
  settings: Settings;
  jobs: Job[];
  mode: PhotoboothMode;
  aiConfigured: boolean;
  screen: ScreenState;
}

export interface JobResponse {
  serverNow: number;
  job: Job;
  position: number | null;
  screenConnected: boolean;
  mode: PhotoboothMode;
}

export interface ApiError {
  error: string;
  code?: string;
}

export type JobAction = "retry" | "skip" | "requeue";
export type ScreenAction = "heartbeat" | "claim" | "complete" | "release";
