import { useEffect, useRef } from "react";
import DailyIframe from "@daily-co/daily-js";

export default function DailyRoom({
  roomUrl,
  token,
  voiceOnly,
  watchOnly = false,
  onJoined,
  onLeft,
  callRef,
}) {
  const containerRef = useRef(null);
  const onJoinedRef = useRef(onJoined);
  const onLeftRef = useRef(onLeft);
  onJoinedRef.current = onJoined;
  onLeftRef.current = onLeft;

  useEffect(() => {
    if (!roomUrl || !containerRef.current) return undefined;
    const call = DailyIframe.createFrame(containerRef.current, {
      iframeStyle: {
        width: "100%",
        height: "100%",
        border: "0",
        borderRadius: "24px",
      },
      showLeaveButton: false,
      showFullscreenButton: true,
    });
    if (callRef) callRef.current = call;

    const handleJoin = () => onJoinedRef.current?.();
    const handleLeave = () => onLeftRef.current?.();
    call.on("joined-meeting", handleJoin);
    call.on("left-meeting", handleLeave);
    call.on("participant-updated", () => {
      const others = Object.values(call.participants());
      if (others.some((p) => !p.local && (p.tracks?.video?.state === "playable" || p.tracks?.audio?.state === "playable" || p.video || p.audio))) {
        onJoinedRef.current?.();
      }
    });

    call.join({
      url: roomUrl,
      token,
      startVideoOff: Boolean(voiceOnly || watchOnly),
      startAudioOff: Boolean(watchOnly),
    });

    return () => {
      call.destroy();
      if (callRef) callRef.current = null;
    };
  }, [roomUrl, token, voiceOnly, watchOnly, callRef]);

  return <div ref={containerRef} className="h-full min-h-[340px] w-full lg:min-h-[420px]" />;
}
