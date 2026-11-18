/**
 * The verify rig's build: the app's own Vite config, with one change. The
 * public folder is not copied into the output; the rig links it in
 * instead (`rig.ts`, `linkPublic`).
 *
 * public/ holds about 460 MB, almost all of it the exercise pictures'
 * lossless frames, which a production build copies and then re-saves as
 * lossy WebP. Copying them on every verify build cost a minute and more
 * disk than a cloud session can spare (the copy filled one on
 * 2026-11-18). Served from public/ through a link, the pictures are the
 * reviewed originals rather than their lossy copies: the same images, at
 * a larger file size, which the rig does not measure.
 */
import { defineConfig, mergeConfig, type UserConfig } from "vite";
import appConfig from "../../vite.config";

export default defineConfig(async (env) => {
  const base = (
    typeof appConfig === "function" ? await appConfig(env) : appConfig
  ) as UserConfig;
  return mergeConfig(base, { build: { copyPublicDir: false } });
});
