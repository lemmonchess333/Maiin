import { useEffect, useState } from "react";
import { isNativePlatform } from "@/lib/platform";
import {
  getHeartRateSensorStatus,
  subscribeHeartRateSensorStatus,
  UNAVAILABLE_SENSOR_STATUS,
  type HeartRateSensorStatus,
} from "@/lib/heartRateSensorBridge";

/**
 * The Bluetooth heart rate sensor's status on this iPhone, kept current by
 * the plugin's `statusChanged` events. On web it stays "not available"
 * without a native call, which is the web-visible half: Settings explains
 * the sensor, and a run streams nothing.
 *
 * Reading the status never shows iOS's Bluetooth prompt: native answers
 * from `CBManager.authorization` until Tropos has asked.
 */
export function useHeartRateSensor(): {
  status: HeartRateSensorStatus;
  /** False on the iPhone until native has answered once; true on web. */
  loaded: boolean;
  setStatus: (status: HeartRateSensorStatus) => void;
} {
  const [status, setStatus] = useState<HeartRateSensorStatus>(
    UNAVAILABLE_SENSOR_STATUS
  );
  const [loaded, setLoaded] = useState(() => !isNativePlatform());

  useEffect(() => {
    if (!isNativePlatform()) return;
    let active = true;
    // An event is newer than the first read, which may answer after it.
    let heard = false;
    let unlisten: () => void = () => {};
    void getHeartRateSensorStatus().then((next) => {
      if (!active) return;
      if (!heard) setStatus(next);
      setLoaded(true);
    });
    void subscribeHeartRateSensorStatus((next) => {
      heard = true;
      if (!active) return;
      setStatus(next);
      setLoaded(true);
    }).then((stop) => {
      if (active) unlisten = stop;
      else stop();
    });
    return () => {
      active = false;
      unlisten();
    };
  }, []);

  return { status, loaded, setStatus };
}
