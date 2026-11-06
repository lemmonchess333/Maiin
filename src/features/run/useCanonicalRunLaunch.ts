import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { auth } from "@/lib/firebase";
import {
  CANONICAL_RUNNING_LAUNCH_ENABLED,
  RUNNING_PRESCRIPTION_GATE_ENABLED,
} from "@/features/program/runningPrescriptionFeature";
import type { RunConfig } from "@/components/run/runConfigDefaults";
import type { RunningPrescriptionAccess } from "@/features/program/runningPrescriptionGate";
import type {
  CanonicalRunLaunchAuthorization,
  CanonicalRunStartAuthorization,
  CanonicalRunLaunchIdentity,
} from "./canonicalRunLaunchTypes";
import type { CanonicalRunLaunchContext } from "./canonicalRunLaunch";

type Mapper = typeof import("./canonicalRunLaunch");
type Input = {
  user: { uid: string } | null | undefined;
  access: RunningPrescriptionAccess;
  sessionId: string | null;
};
function useEnabledCanonicalRunLaunch(input: Input) {
  const [mapper, setMapper] = useState<Mapper | null>(null);
  const [nowMs, setNowMs] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const current = useRef(input);
  const mounted = useRef(true);
  const permits = useRef(
    new WeakMap<
      RunConfig,
      {
        user: object;
        expiresAtMs: number;
        selectedId: string | null;
        activityId?: string;
      }
    >()
  );
  useLayoutEffect(() => {
    current.current = input;
  });
  useEffect(() => {
    mounted.current = true;
    void import("./canonicalRunLaunch").then(
      (module) => {
        if (mounted.current) setMapper(module);
      },
      () => {}
    );
    return () => {
      mounted.current = false;
    };
  }, []);
  const readContext = (): CanonicalRunLaunchContext => ({
    user:
      mounted.current && auth.currentUser === current.current.user
        ? auth.currentUser
        : null,
    online: navigator.onLine,
    access: current.current.access,
    nowMs: Date.now(),
  });
  // Render uses current props, never a previous commit's ref.
  const renderContext = {
    user: auth.currentUser === input.user ? auth.currentUser : null,
    online: navigator.onLine,
    access: input.access,
    nowMs,
  };
  const candidate =
    mapper?.selectCanonicalRunLaunch(renderContext, input.sessionId) ?? null;
  return {
    enabled: true,
    candidate,
    activityRecorded:
      mapper?.hasRecordedCanonicalActivity(renderContext, input.sessionId) ??
      false,
    matches: (config: RunConfig | null) =>
      !!config?.canonicalLaunch &&
      !!mapper?.canonicalLaunchMatchesContext(
        config.canonicalLaunch,
        renderContext
      ),
    canStart(config: RunConfig, activityId?: string) {
      const permit = permits.current.get(config);
      const context = readContext();
      return (
        !!permit &&
        context.user === permit.user &&
        activityId === permit.activityId &&
        current.current.sessionId === permit.selectedId &&
        context.nowMs < permit.expiresAtMs &&
        !!config.canonicalLaunch &&
        !!mapper?.canonicalLaunchMatchesContext(config.canonicalLaunch, context)
      );
    },
    async authorize(
      identity: CanonicalRunLaunchIdentity,
      preferences: Pick<RunConfig, "audioCues" | "shoeId" | "place">,
      setup?: () => Promise<unknown>,
      activityId?: string
    ) {
      const started = readContext();
      const selectedId = current.current.sessionId;
      const readSelectedContext = () => ({
        ...readContext(),
        ...(current.current.sessionId !== selectedId ? { user: null } : {}),
      });
      const module = mapper ?? (await import("./canonicalRunLaunch"));
      const { runningReviewTransport } =
        await import("@/features/program/runningReviewTransport");
      if (!started.user || readSelectedContext().user !== started.user)
        throw Error("Your account changed. Check the session again.");
      const config = await module.authorizeCanonicalRunStart({
        identity,
        readContext: readSelectedContext,
        preferences,
        setup,
        activityId,
        transport: (request) =>
          "activityId" in request
            ? runningReviewTransport.registerStart(request)
            : runningReviewTransport.authorizeLaunch(request),
      });
      if (readSelectedContext().user !== started.user)
        throw Error("Your account changed. Check the session again.");
      permits.current.set(config, {
        user: started.user,
        selectedId,
        activityId: (config.canonicalLaunch as CanonicalRunStartAuthorization)
          .activityId,
        expiresAtMs: (config.canonicalLaunch as CanonicalRunLaunchAuthorization)
          .expiresAtMs,
      });
      return config;
    },
  };
}
function useInactiveCanonicalRunLaunch() {
  return {
    enabled: false,
    activityRecorded: false,
    candidate: null as CanonicalRunLaunchIdentity | null,
    matches: (_config: RunConfig | null) => false,
    canStart: (_config: RunConfig, _activityId?: string) => false,
    authorize: async (
      _identity: CanonicalRunLaunchIdentity,
      _preferences: Pick<RunConfig, "audioCues" | "shoeId" | "place">,
      _setup?: () => Promise<unknown>,
      _activityId?: string
    ): Promise<RunConfig> => {
      throw Error("Planned running is unavailable.");
    },
  };
}
/** Neither the mapper nor the authenticated transport loads while inactive. */
export const useCanonicalRunLaunch =
  CANONICAL_RUNNING_LAUNCH_ENABLED && RUNNING_PRESCRIPTION_GATE_ENABLED
    ? useEnabledCanonicalRunLaunch
    : useInactiveCanonicalRunLaunch;
