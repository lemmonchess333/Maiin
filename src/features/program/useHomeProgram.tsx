import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { localDateString } from "@/lib/dateHelpers";
import { logger } from "@/lib/logger";
import { homeProgramSnapshot } from "./homeProgramSnapshot";
import { fetchRecentLayoff } from "./fetchRecentLayoff";
import type { LayoffClass } from "./layoffDetection";
import type { ProgramState } from "./programTypes";
import type { ProgramController } from "./HomeProgramController";

type ControllerComponent = ComponentType<{
  publish: (value: ProgramController) => void;
}>;
type Actions = Pick<
  ProgramController,
  | "overrideRunDay"
  | "markManualComplete"
  | "skipRunDay"
  | "skipWorkoutDay"
  | "restoreRunDay"
  | "restoreWorkoutDay"
  | "moveRunDay"
  | "dismissFellBehindPrompt"
  | "realignRacePlan"
>;

export function useHomeProgram() {
  const { user, profile } = useAuth();
  const uid = user?.uid;
  const [snapshot, setSnapshot] = useState<{
    uid: string;
    programState: ProgramState | null;
    needsMaintenance: boolean;
  } | null>(null);
  const [loadedController, setController] = useState<{
    uid: string;
    component: ControllerComponent;
  } | null>(null);
  const [layoff, setLayoff] = useState<{
    uid: string;
    value: LayoffClass;
  } | null>(null);
  const api = useRef<{ uid: string; value: ProgramController } | null>(null);
  const pending = useRef<
    {
      resolve: (value: ProgramController) => void;
      reject: (error: Error) => void;
    }[]
  >([]);
  const alive = useRef(false);
  const importing = useRef<Promise<void> | null>(null);

  useEffect(() => {
    alive.current = true;
    const requests = pending.current;
    return () => {
      alive.current = false;
      if (api.current?.uid === uid) api.current = null;
      importing.current = null;
      requests
        .splice(0)
        .forEach(({ reject }) =>
          reject(new Error("Account or page changed. Please try again."))
        );
    };
  }, [uid]);
  const publish = useCallback(
    (value: ProgramController) => {
      if (!uid || auth.currentUser?.uid !== uid) return;
      api.current = { uid, value };
      if (!value.loading) {
        pending.current.splice(0).forEach(({ resolve, reject }) => {
          if (value.programState) resolve(value);
          else
            reject(
              new Error("Couldn't load your programme. Please try again.")
            );
        });
      }
    },
    [uid]
  );
  const prepare = useCallback(async () => {
    if (!uid || auth.currentUser?.uid !== uid || !alive.current)
      throw new Error("Account changed");
    if (!importing.current) {
      importing.current = import("./HomeProgramController")
        .then((module) => {
          if (alive.current && auth.currentUser?.uid === uid)
            setController({ uid, component: module.default });
        })
        .catch((error) => {
          importing.current = null;
          throw error;
        });
    }
    await importing.current;
    if (!alive.current || auth.currentUser?.uid !== uid)
      throw new Error("Account changed");
    if (
      api.current?.uid === uid &&
      !api.current.value.loading &&
      api.current.value.programState
    )
      return api.current.value;
    return new Promise<ProgramController>((resolve, reject) =>
      pending.current.push({ resolve, reject })
    );
  }, [uid]);

  useEffect(() => {
    if (!uid || !profile) return;
    let active = true;
    const stop = onSnapshot(
      doc(db, "users", uid, "programState", "current"),
      (value) => {
        if (!active) return;
        // An empty cache is not proof that a new programme needs generating.
        if (!value.exists() && value.metadata.fromCache) return;
        const read = homeProgramSnapshot(
          value.exists() ? (value.data() as ProgramState) : null,
          profile
        );
        setSnapshot({ uid, ...read });
        if (read.needsMaintenance)
          void prepare().catch((error) =>
            logger.warn("Home programme maintenance pending", error)
          );
      },
      (error) => {
        if (active) {
          setSnapshot({ uid, programState: null, needsMaintenance: false });
          logger.warn("Home programme read failed", error);
        }
      }
    );
    return () => {
      active = false;
      stop();
    };
  }, [uid, profile, prepare]);
  useEffect(() => {
    if (!uid || !profile?.runMode || profile.runMode === "freeform") return;
    let active = true;
    void fetchRecentLayoff(uid, localDateString()).then((value) => {
      if (active) setLayoff({ uid, value });
    });
    return () => {
      active = false;
    };
  }, [uid, profile?.runMode]);

  function action<K extends keyof Actions>(name: K) {
    return async (
      ...args: Parameters<Actions[K]>
    ): Promise<Awaited<ReturnType<Actions[K]>>> => {
      const controller = await prepare();
      if (auth.currentUser?.uid !== uid) throw new Error("Account changed");
      const method = controller[name] as (
        ...values: Parameters<Actions[K]>
      ) => ReturnType<Actions[K]>;
      return (await method(...args)) as Awaited<ReturnType<Actions[K]>>;
    };
  }
  const Controller =
    loadedController && loadedController.uid === uid ? loadedController.component : null;
  return {
    programState:
      snapshot && snapshot.uid === uid ? snapshot.programState : null,
    loading: !!uid && snapshot?.uid !== uid,
    recentLayoff:
      layoff && layoff.uid === uid ? layoff.value : ("none" as LayoffClass),
    controller: Controller ? <Controller key={uid} publish={publish} /> : null,
    overrideRunDay: action("overrideRunDay"),
    markManualComplete: action("markManualComplete"),
    skipRunDay: action("skipRunDay"),
    skipWorkoutDay: action("skipWorkoutDay"),
    restoreRunDay: action("restoreRunDay"),
    restoreWorkoutDay: action("restoreWorkoutDay"),
    moveRunDay: action("moveRunDay"),
    dismissFellBehindPrompt: action("dismissFellBehindPrompt"),
    realignRacePlan: action("realignRacePlan"),
  };
}
