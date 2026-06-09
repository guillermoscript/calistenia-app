"use client";;
import { Button } from "../ui/button";
import {
  ButtonGroup,
  ButtonGroupText,
} from "../ui/button-group";
import { cn } from "../../lib/utils";
import {
  MediaControlBar,
  MediaController,
  MediaDurationDisplay,
  MediaMuteButton,
  MediaPlayButton,
  MediaSeekBackwardButton,
  MediaSeekForwardButton,
  MediaTimeDisplay,
  MediaTimeRange,
  MediaVolumeRange,
} from "media-chrome/react";

export const AudioPlayer = ({
  children,
  style,
  ...props
}: any) => (
  <MediaController
    audio
    data-slot="audio-player"
    style={
      {
        "--media-background-color": "transparent",
        "--media-button-icon-height": "1rem",
        "--media-button-icon-width": "1rem",
        "--media-control-background": "transparent",
        "--media-control-hover-background": "var(--color-accent)",
        "--media-control-padding": "0",
        "--media-font": "var(--font-sans)",
        "--media-font-size": "10px",
        "--media-icon-color": "currentColor",
        "--media-preview-time-background": "var(--color-background)",
        "--media-preview-time-border-radius": "var(--radius-md)",
        "--media-preview-time-text-shadow": "none",
        "--media-primary-color": "var(--color-primary)",
        "--media-range-bar-color": "var(--color-primary)",
        "--media-range-track-background": "var(--color-secondary)",
        "--media-secondary-color": "var(--color-secondary)",
        "--media-text-color": "var(--color-foreground)",
        "--media-tooltip-arrow-display": "none",
        "--media-tooltip-background": "var(--color-background)",
        "--media-tooltip-border-radius": "var(--radius-md)",
        ...style
      }
    }
    {...props}>
    {children}
  </MediaController>
);

export const AudioPlayerElement = ({
  ...props
}: any) => (
  // oxlint-disable-next-line eslint-plugin-jsx-a11y(media-has-caption) -- audio player captions are provided by consumer
  (<audio
    data-slot="audio-player-element"
    slot="media"
    src={
      "src" in props
        ? props.src
        : `data:${props.data.mediaType};base64,${props.data.base64}`
    }
    {...props} />)
);

export const AudioPlayerControlBar = ({
  children,
  ...props
}: any) => (
  <MediaControlBar data-slot="audio-player-control-bar" {...props}>
    <ButtonGroup orientation="horizontal">{children}</ButtonGroup>
  </MediaControlBar>
);

export const AudioPlayerPlayButton = ({
  className,
  ...props
}: any) => (
  <Button asChild size="icon-sm" variant="outline">
    <MediaPlayButton
      className={cn("bg-transparent", className)}
      data-slot="audio-player-play-button"
      {...props} />
  </Button>
);

export const AudioPlayerSeekBackwardButton = ({
  seekOffset = 10,
  ...props
}: any) => (
  <Button asChild size="icon-sm" variant="outline">
    <MediaSeekBackwardButton
      data-slot="audio-player-seek-backward-button"
      seekOffset={seekOffset}
      {...props} />
  </Button>
);

export const AudioPlayerSeekForwardButton = ({
  seekOffset = 10,
  ...props
}: any) => (
  <Button asChild size="icon-sm" variant="outline">
    <MediaSeekForwardButton
      data-slot="audio-player-seek-forward-button"
      seekOffset={seekOffset}
      {...props} />
  </Button>
);

export const AudioPlayerTimeDisplay = ({
  className,
  ...props
}: any) => (
  <ButtonGroupText asChild className="bg-transparent">
    <MediaTimeDisplay
      className={cn("tabular-nums", className)}
      data-slot="audio-player-time-display"
      {...props} />
  </ButtonGroupText>
);

export const AudioPlayerTimeRange = ({
  className,
  ...props
}: any) => (
  <ButtonGroupText asChild className="bg-transparent">
    <MediaTimeRange
      className={cn("", className)}
      data-slot="audio-player-time-range"
      {...props} />
  </ButtonGroupText>
);

export const AudioPlayerDurationDisplay = ({
  className,
  ...props
}: any) => (
  <ButtonGroupText asChild className="bg-transparent">
    <MediaDurationDisplay
      className={cn("tabular-nums", className)}
      data-slot="audio-player-duration-display"
      {...props} />
  </ButtonGroupText>
);

export const AudioPlayerMuteButton = ({
  className,
  ...props
}: any) => (
  <ButtonGroupText asChild className="bg-transparent">
    <MediaMuteButton
      className={cn("", className)}
      data-slot="audio-player-mute-button"
      {...props} />
  </ButtonGroupText>
);

export const AudioPlayerVolumeRange = ({
  className,
  ...props
}: any) => (
  <ButtonGroupText asChild className="bg-transparent">
    <MediaVolumeRange
      className={cn("", className)}
      data-slot="audio-player-volume-range"
      {...props} />
  </ButtonGroupText>
);
