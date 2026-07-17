"use client";

import autoAnimate, {
  type AnimationController,
  type AutoAnimateOptions,
  type AutoAnimationPlugin,
} from "@formkit/auto-animate";
import { useCallback, useEffect, useRef, type RefCallback } from "react";

type AutoAnimationConfig = Partial<AutoAnimateOptions> | AutoAnimationPlugin;

export function useAutoAnimation<T extends HTMLElement = HTMLElement>(
  config?: AutoAnimationConfig
) {
  const configRef = useRef(config);
  const controllerRef = useRef<AnimationController | null>(null);
  const enabledRef = useRef(true);
  const frameIdsRef = useRef<number[]>([]);
  const nodeRef = useRef<T | null>(null);

  // Keep the latest config in a ref for the post-commit rAF consumer
  // (`initialize`) to read. Assign in a passive effect rather than the render
  // body so the ref is never mutated during a render React may replay or
  // discard.
  useEffect(() => {
    configRef.current = config;
  });

  const cancelScheduledInit = useCallback(() => {
    for (const frameId of frameIdsRef.current) {
      cancelAnimationFrame(frameId);
    }
    frameIdsRef.current = [];
  }, []);

  const destroyController = useCallback(() => {
    cancelScheduledInit();
    controllerRef.current?.destroy?.();
    controllerRef.current = null;
  }, [cancelScheduledInit]);

  const setEnabled = useCallback((enabled: boolean) => {
    enabledRef.current = enabled;
    const controller = controllerRef.current;
    if (!controller) {
      return;
    }
    if (enabled) {
      controller.enable();
    } else {
      controller.disable();
    }
  }, []);

  const setRef = useCallback(
    (node: T | null) => {
      if (nodeRef.current === node) {
        return;
      }

      destroyController();
      nodeRef.current = node;
      if (!node) {
        return;
      }

      let remainingFrames = 2;
      const initialize = () => {
        if (nodeRef.current !== node || !node.isConnected) {
          return;
        }
        if (remainingFrames > 0) {
          remainingFrames -= 1;
          frameIdsRef.current.push(requestAnimationFrame(initialize));
          return;
        }

        const controller = autoAnimate(node, configRef.current);
        controllerRef.current = controller;
        if (!enabledRef.current) {
          controller.disable();
        }
      };

      frameIdsRef.current.push(requestAnimationFrame(initialize));
    },
    [destroyController]
  );

  useEffect(() => destroyController, [destroyController]);

  return [setRef, setEnabled] as [RefCallback<T>, typeof setEnabled];
}
