import type { Platform } from "./types";
import { tauriPlatform } from "./tauri";
import { webPlatform } from "./web";

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const platform: Platform = inTauri ? tauriPlatform : webPlatform;

export type { Platform, FileContent, DirEntry, AskOptions, SearchHit } from "./types";
