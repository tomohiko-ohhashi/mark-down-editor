import { describe, it, expect, beforeEach } from "vitest";
import { useSettings, loadSettings, hasUnsavedSettings, DEFAULT_SETTINGS } from "../store/useSettings";

/** What is on "disk" (the browser build keeps settings in localStorage). */
const stored = () => JSON.parse(localStorage.getItem("settings") ?? "{}") as Record<string, unknown>;

describe("settings preview / save / cancel", () => {
  beforeEach(async () => {
    localStorage.clear();
    useSettings.getState().cancelPreview();
    useSettings.setState({ ...DEFAULT_SETTINGS });
    await loadSettings();
  });

  it("shows a previewed change at once without saving it", () => {
    useSettings.getState().preview({ theme: "dark", tabSize: 4 });
    expect(useSettings.getState().theme).toBe("dark");
    expect(useSettings.getState().tabSize).toBe(4);
    expect(hasUnsavedSettings()).toBe(true);
    expect(stored().theme).toBeUndefined();
  });

  it("saves the previewed values on commit", () => {
    useSettings.getState().preview({ theme: "dark" });
    useSettings.getState().preview({ theme: "light", editorFontSize: 18 });
    useSettings.getState().commitPreview();
    expect(hasUnsavedSettings()).toBe(false);
    expect(stored()).toMatchObject({ theme: "light", editorFontSize: 18 });
    expect(useSettings.getState().theme).toBe("light");
  });

  it("puts the saved values back on cancel", () => {
    useSettings.getState().update({ theme: "light" });
    useSettings.getState().preview({ theme: "dark", lineWrap: false });
    useSettings.getState().preview({ theme: "system" });
    useSettings.getState().cancelPreview();
    expect(useSettings.getState().theme).toBe("light");
    expect(useSettings.getState().lineWrap).toBe(true);
    expect(hasUnsavedSettings()).toBe(false);
    expect(stored().theme).toBe("light");
  });

  it("does not let other saves carry an unsaved preference to disk", () => {
    useSettings.getState().preview({ theme: "dark", language: "en" });
    // Things that are saved all the time while the dialog is open:
    useSettings.getState().addRecent("/notes/a.md");
    useSettings.getState().update({ lastOpenFiles: ["/notes/a.md"] });
    expect(stored()).toMatchObject({ theme: "system", language: "system", recentFiles: ["/notes/a.md"], lastOpenFiles: ["/notes/a.md"] });
    // The window still shows the preview.
    expect(useSettings.getState().theme).toBe("dark");
    useSettings.getState().cancelPreview();
    expect(useSettings.getState()).toMatchObject({ theme: "system", language: "system", recentFiles: ["/notes/a.md"] });
  });

  it("is not 'unsaved' when a value was changed back by hand", () => {
    useSettings.getState().preview({ tabSize: 8 });
    useSettings.getState().preview({ tabSize: DEFAULT_SETTINGS.tabSize });
    expect(hasUnsavedSettings()).toBe(false);
  });
});
