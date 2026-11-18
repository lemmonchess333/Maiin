/**
 * Scratch config for the website's app captures (claude/site-captures,
 * never merged): the base config with the capture project at device scale
 * 3, so the frames the website shows are sharp on a high-density screen.
 */
import base from "./playwright.config";

export default {
  ...base,
  projects: (base.projects ?? []).map((project) =>
    project.name === "auth-emulator"
      ? { ...project, use: { ...project.use, deviceScaleFactor: 3 } }
      : project
  ),
};
