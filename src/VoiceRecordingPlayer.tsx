import { useEffect, useRef, useState } from "react";
import { prepareVoiceRecordingForBrowser } from "./gsmMsWav";

type RepairedVoice = { source: string; url: string };

/** Playback-only player for saved calls, including compact GSM 6.10 WAVs. */
export default function VoiceRecordingPlayer({ url, name, type }: { url: string; name: string; type?: string }) {
  const [repaired, setRepaired] = useState<RepairedVoice | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const currentSource = useRef(url);
  currentSource.current = url;

  useEffect(() => {
    setRepaired(null);
    setPreparing(false);
    setError("");
    inFlight.current = false;
  }, [url]);

  useEffect(() => () => {
    if (repaired?.url.startsWith("blob:")) URL.revokeObjectURL(repaired.url);
  }, [repaired]);

  async function repairPlayback() {
    if (!url || inFlight.current || repaired?.source === url) return;
    inFlight.current = true;
    setPreparing(true);
    setError("");
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("โหลดไฟล์เสียงที่บันทึกไว้ไม่สำเร็จ");
      const blob = await response.blob();
      const original = new File([blob], name || "voice-recording.wav", {
        type: type || blob.type || "audio/wav",
      });
      const prepared = await prepareVoiceRecordingForBrowser(original);
      if (!prepared.converted) throw new Error("ไม่สามารถเล่นไฟล์เสียงนี้ในเบราว์เซอร์ได้");
      const localUrl = URL.createObjectURL(prepared.file);
      if (currentSource.current !== url) {
        URL.revokeObjectURL(localUrl);
        return;
      }
      setRepaired({ source: url, url: localUrl });
    } catch (cause) {
      if (currentSource.current === url) {
        setError(cause instanceof Error ? cause.message : "เตรียมไฟล์เสียงไม่สำเร็จ");
      }
    } finally {
      if (currentSource.current === url) setPreparing(false);
      inFlight.current = false;
    }
  }

  return (
    <div>
      <audio
        controls
        controlsList="nodownload noplaybackrate"
        preload="metadata"
        src={repaired?.source === url ? repaired.url : url}
        className="w-full"
        onContextMenu={(event) => event.preventDefault()}
        onError={() => { if (!error) void repairPlayback(); }}
      />
      {preparing ? <div className="mt-2 text-xs font-semibold text-amber-700">Preparing Audio Playback...</div> : null}
      {error ? (
        <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-rose-700">
          <span>{error}</span>
          <button type="button" className="rounded-md border border-rose-200 px-2 py-1" onClick={() => { setError(""); void repairPlayback(); }}>Retry</button>
        </div>
      ) : null}
    </div>
  );
}
