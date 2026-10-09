/**
 * AANYA AI — Avatar View Component
 *
 * Displays the static AANYA JPG avatar as the primary visual presence.
 * Designed to cleanly fill the main stage while preserving aspect ratio.
 * Houses the voice status indicators, soundwaves, and overlaid controls.
 *
 * NOTE: As per UI redesign specifications, this component renders the
 * static JPG image without 3D/GLB or animation overhead.
 */

import React, { memo } from "react";
import { AvatarState } from "../avatar/types";

export interface AvatarViewProps {
  /** Current avatar state */
  state: AvatarState;
  /** Static image source for AANYA JPG */
  fallbackImageSrc: string;
  /** Optional custom CSS class name */
  className?: string;
  /** Child overlays (e.g. voice status, controls) */
  children?: React.ReactNode;
}

export const AvatarView: React.FC<AvatarViewProps> = memo(
  ({
    state,
    fallbackImageSrc,
    className = "",
    children,
  }) => {
    return (
      <div
        className={`zoya-picture-frame ${className}`.trim()}
        data-avatar-mode={state.mode}
        data-avatar-emotion={state.emotion}
        data-avatar-speaking={state.speaking}
        data-avatar-listening={state.listening}
      >
        {/* =========================================================
            STATIC FULL-STAGE AANYA JPG AVATAR
        ========================================================= */}
        <img
          src={fallbackImageSrc}
          alt="AANYA"
          className="zoya-main-image"
          loading="eager"
          decoding="sync"
          draggable={false}
        />

        {/* Cinematic optical vignette overlay for readability */}
        <div className="zoya-image-overlay" />

        {/* Overlay children: Speaking wave, voice status, and controls */}
        {children}
      </div>
    );
  }
);

AvatarView.displayName = "AvatarView";
