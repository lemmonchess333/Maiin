import { useCallback, useEffect, useRef, useState } from "react";
import { useUid } from "@/lib/auth";
import {
  DEFAULT_CONNECTED_TRAINING_PREFS,
  loadConnectedTrainingPrefs,
  saveConnectedTrainingPref,
  type ConnectedTrainingPrefs,
  type ConnectedTrainingPrefKey,
} from "@/lib/connectedTrainingPrefs";

interface PrefState {
  uid: string | null;
  prefs: ConnectedTrainingPrefs;
  loading: boolean;
  failed: boolean;
}

export function useConnectedTrainingPrefs() {
  const uid = useUid();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<PrefState>({
    uid: null,
    prefs: DEFAULT_CONNECTED_TRAINING_PREFS,
    loading: false,
    failed: false,
  });
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (!uid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear account-owned consent on sign-out
      setState({
        uid: null,
        prefs: DEFAULT_CONNECTED_TRAINING_PREFS,
        loading: false,
        failed: false,
      });
      return () => {
        cancelled = true;
      };
    }

    setState({
      uid,
      prefs: DEFAULT_CONNECTED_TRAINING_PREFS,
      loading: true,
      failed: false,
    });
    void loadConnectedTrainingPrefs(uid).then(({ prefs, ok }) => {
      if (cancelled) return;
      setState({ uid, prefs, loading: false, failed: !ok });
    });
    return () => {
      cancelled = true;
    };
  }, [uid, revision]);

  const loading = !!uid && (state.uid !== uid || state.loading);
  const failed = state.uid === uid && state.failed;
  const prefs =
    state.uid === uid ? state.prefs : DEFAULT_CONNECTED_TRAINING_PREFS;

  const update = useCallback(
    async (key: ConnectedTrainingPrefKey, enabled: boolean) => {
      if (!uid || loading || failed || busyRef.current) return false;
      busyRef.current = true;
      try {
        const saved = await saveConnectedTrainingPref(uid, key, enabled);
        if (!saved) return false;
        setState((previous) =>
          previous.uid === uid
            ? {
                ...previous,
                prefs: { ...previous.prefs, [key]: enabled },
              }
            : previous
        );
        return true;
      } finally {
        busyRef.current = false;
      }
    },
    [uid, loading, failed]
  );

  const retry = useCallback(() => setRevision((previous) => previous + 1), []);

  return { prefs, loading, failed, update, retry };
}
