import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface PlayerHandle {
  getCurrentTime: () => number;
  seekTo: (seconds: number) => void;
}

interface YouTubePlayerProps {
  videoId: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
let apiPromise: Promise<any> | null = null;

function loadIframeApi(): Promise<any> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const w = window as any;
    if (w.YT?.Player) {
      resolve(w.YT);
      return;
    }
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(w.YT);
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return apiPromise;
}

export const YouTubePlayer = forwardRef<PlayerHandle, YouTubePlayerProps>(
  ({ videoId }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      getCurrentTime: () => {
        try {
          return playerRef.current?.getCurrentTime?.() ?? 0;
        } catch {
          return 0;
        }
      },
      seekTo: (seconds: number) => {
        try {
          playerRef.current?.seekTo?.(seconds, true);
          playerRef.current?.playVideo?.();
        } catch {
          // player not ready yet
        }
      },
    }));

    useEffect(() => {
      let cancelled = false;

      loadIframeApi().then((YT) => {
        if (cancelled || !containerRef.current) return;
        playerRef.current = new YT.Player(containerRef.current, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: { rel: 0, playsinline: 1 },
        });
      });

      return () => {
        cancelled = true;
        try {
          playerRef.current?.destroy?.();
        } catch {
          // already gone
        }
        playerRef.current = null;
      };
    }, [videoId]);

    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
        <div ref={containerRef} className="h-full w-full" />
      </div>
    );
  },
);

YouTubePlayer.displayName = "YouTubePlayer";
