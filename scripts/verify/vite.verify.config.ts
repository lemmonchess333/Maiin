/**
 * The verify rig's build: the app's own Vite config, with two changes.
 * The public folder is not copied into the output; the rig links it in
 * instead (`rig.ts`, `linkPublic`). And the plugin that re-saves the form
 * frames in the output is left out: it rewrites files in place, and in
 * this output those files are links into public/.
 *
 * public/ holds about 460 MB, almost all of it the exercise pictures'
 * lossless frames, which a production build copies and then re-saves as
 * lossy WebP. Copying them on every verify build cost a minute and more
 * disk than a cloud session can spare (the copy filled one on
 * 2026-11-18). Served from public/ through a link, the pictures are the
 * reviewed originals rather than their lossy copies: the same images, at
 * a larger file size, which the rig does not measure.
 */
import {
  defineConfig,
  mergeConfig,
  type Plugin,
  type PluginOption,
  type UserConfig,
} from "vite";
import appConfig from "../../vite.config";
import { REWRITES_OUTPUT } from "./rigConfig";

async function flatPlugins(option: PluginOption): Promise<Plugin[]> {
  const value = await option;
  if (!value) return [];
  if (Array.isArray(value))
    return (await Promise.all(value.map(flatPlugins))).flat();
  return [value as Plugin];
}

export default defineConfig(async (env) => {
  const base = (
    typeof appConfig === "function" ? await appConfig(env) : appConfig
  ) as UserConfig;
  const plugins = (await flatPlugins(base.plugins ?? [])).filter(
    (p) => p.name !== REWRITES_OUTPUT
  );
  return mergeConfig({ ...base, plugins }, { build: { copyPublicDir: false } });
});
