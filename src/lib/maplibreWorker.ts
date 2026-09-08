import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

// V6 uses a separate ESM worker. Vite emits it with the correct hosting base,
// so Pages, Firebase Hosting and the packaged native app share this setup.
setWorkerUrl(workerUrl);
