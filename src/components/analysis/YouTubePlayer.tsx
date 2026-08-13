import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface PlayerHandle {
  getCurrentTime: () => number;
  seekTo: (seconds: number) => void;
  setPlaybackRate: (rate: number) => void;
}

interface YouTubePlayerProps {
  videoId: string;
  /** Repeat the video forever — ear training listens over and over. */
  loop?: boolean;
  /** Applied once the player is ready, and whenever it changes. */
  playbackRate?: number;
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
  ({ videoId, loop = false, playbackRate = 1 }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<any>(null);
    const rateRef = useRef(playbackRate);
    rateRef.current = playbackRate;

    const applyRate = (rate: number) => {
      try {
        playerRef.current?.setPlaybackRate?.(rate);
      } catch {
        // player not ready yet
      }
    };

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
      setPlaybackRate: applyRate,
    }));

    useEffect(() => {
      let cancelled = false;

      loadIframeApi().then((YT) => {
        if (cancelled || !containerRef.current) return;
        playerRef.current = new YT.Player(containerRef.current, {
          videoId,
          width: "100%",
          height: "100%",
          // looping a single video needs it declared as its own playlist
          playerVars: {
            rel: 0,
            playsinline: 1,
            ...(loop ? { loop: 1, playlist: videoId } : {}),
          },
          events: {
            onReady: () => applyRate(rateRef.current),
          },
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
    }, [videoId, loop]);

    useEffect(() => {
      applyRate(playbackRate);
    }, [playbackRate]);

    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
        <div ref={containerRef} className="h-full w-full" />
      </div>
    );
  },
);

YouTubePlayer.displayName = "YouTubePlayer";
