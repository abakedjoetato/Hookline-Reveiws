"use client";

import * as React from "react";
import { Badge, Button } from "@platform/ui";
import { Music, Play, Pause, Trash2, Clock, Activity, AlertTriangle } from "lucide-react";
import { TrackSummary } from "@platform/types";
import { api } from "../lib/api";

interface TrackItemProps {
  track: TrackSummary;
  onDeleted?: () => void;
  onSelect?: (track: TrackSummary) => void;
  isSelected?: boolean;
}

export const TrackItem: React.FC<TrackItemProps> = ({
  track,
  onDeleted,
  onSelect,
  isSelected,
}) => {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const formatDuration = (seconds: number) => {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handlePlayToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      return;
    }

    try {
      if (!audioUrl) {
        setIsLoadingAudio(true);
        const { downloadUrl } = await api.tracks.download(track.id);
        setAudioUrl(downloadUrl);
        if (audioRef.current) {
          audioRef.current.src = downloadUrl;
          await audioRef.current.play();
          setIsPlaying(true);
        }
      } else if (audioRef.current) {
        await audioRef.current.play();
        setIsPlaying(true);
      }
    } catch (err) {
      console.error("Failed to load audio preview", err);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${track.songName}"?`)) {
      return;
    }
    setIsDeleting(true);
    try {
      await api.tracks.delete(track.id);
      onDeleted?.();
    } catch (err) {
      console.error("Failed to delete track", err);
      alert("Failed to delete track.");
    } finally {
      setIsDeleting(false);
    }
  };

  const getProcessingBadge = () => {
    switch (track.processingState) {
      case "READY":
        return <Badge variant="success">Ready</Badge>;
      case "PROCESSING":
        return <Badge variant="warning">Processing</Badge>;
      case "FAILED":
        return <Badge variant="danger">Failed</Badge>;
      default:
        return <Badge variant="info">{track.processingState}</Badge>;
    }
  };

  return (
    <div
      onClick={() => onSelect?.(track)}
      className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-lg border transition-all ${
        isSelected
          ? "border-violet-500 bg-violet-950/20"
          : "border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900 hover:border-zinc-700"
      } ${onSelect ? "cursor-pointer" : ""}`}
    >
      <audio
        ref={audioRef}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
      />

      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        <button
          type="button"
          onClick={handlePlayToggle}
          disabled={track.processingState !== "READY" || isLoadingAudio}
          className="h-10 w-10 shrink-0 rounded-full bg-zinc-800 hover:bg-violet-600 text-zinc-200 hover:text-white flex items-center justify-center transition-colors disabled:opacity-40 disabled:hover:bg-zinc-800 cursor-pointer"
        >
          {isLoadingAudio ? (
            <Activity className="h-4 w-4 animate-spin text-violet-400" />
          ) : isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 ml-0.5" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-sm text-zinc-100 truncate">
              {track.songName}
            </h4>
            {track.explicitContent && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-zinc-800 text-zinc-300 rounded border border-zinc-700">
                E
              </span>
            )}
            {getProcessingBadge()}
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-400 mt-1 flex-wrap">
            <span className="text-zinc-300 font-medium">
              {track.artistIdentity?.artistName || "Unknown Artist"}
            </span>
            {track.albumName && <span>• {track.albumName}</span>}
            {track.bpm && <span>• {track.bpm} BPM</span>}
            {track.musicalKey && <span>• Key {track.musicalKey}</span>}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(track.durationSeconds)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 sm:mt-0 self-end sm:self-center shrink-0">
        {onSelect && (
          <Button
            type="button"
            variant={isSelected ? "primary" : "outline"}
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(track);
            }}
          >
            {isSelected ? "Selected" : "Select"}
          </Button>
        )}

        {onDeleted && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-50"
            title="Delete Track"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};
