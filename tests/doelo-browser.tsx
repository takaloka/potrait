// Isolated manual browser proof: no production API or paid generation calls.
import React from "react";
import { createRoot } from "react-dom/client";
import EventScreen from "../components/event-screen";
import { renderPosterBlob } from "../lib/poster-download";

let theme = "bojonegoro-doelo";
const job = { id: "fixture", name: "Raden Sekar", status: "displaying", resultUrl: "/samples/before.jpg", originalUrl: "", displayedAt: 1 };
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  if (String(input) === "/api/screen") {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    return Response.json({ jobs: [{ ...job, posterTheme: theme }], settings: { paused: false }, screen: { currentJobId: "fixture", sessionId: body.sessionId, endsAt: Date.now() + 60000 }, serverNow: Date.now(), nextJobId: null, queueCounts: { ready: 0, processing: 0 } });
  }
  return realFetch(input, init);
};
Object.assign(window, { setFixtureTheme: (value: string) => { theme = value; } });
if (new URLSearchParams(location.search).get("view") === "print") {
  renderPosterBlob({ ...job, posterTheme: "bojonegoro-doelo" }).then(async blob => {
    const image = new Image(); image.src = URL.createObjectURL(blob); await image.decode();
    image.style.cssText = "display:block;width:100%;height:auto";
    document.body.replaceChildren(image);
    document.body.dataset.export = `${image.naturalWidth}x${image.naturalHeight}:${blob.type}`;
  }).catch(error => { document.body.textContent = String(error); });
} else createRoot(document.getElementById("root")!).render(<EventScreen />);
