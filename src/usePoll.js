import { useCallback, useEffect, useState } from "react";

// Loads data, then refreshes it every `ms` milliseconds (live updates without websockets).
export function usePoll(fn, ms, deps) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(async () => {
    try {
      setData(await fn());
      setErr("");
    } catch (e) {
      setErr(e.message);
    }
  }, deps);

  useEffect(() => {
    reload();
    if (!ms) return;
    const id = setInterval(reload, ms);
    return () => clearInterval(id);
  }, [reload, ms]);

  return { data, err, reload };
}
