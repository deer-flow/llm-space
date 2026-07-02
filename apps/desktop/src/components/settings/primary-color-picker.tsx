"use client";

import {
  BlossomColorPicker,
  hexToHsl,
  type BlossomColorPickerColor,
  type BlossomColorPickerValue,
} from "@dayflow/blossom-color-picker-react";
import { useCallback } from "react";

/** Seed the core from the active hex (alpha is 0-100 in this widget). */
function _toValue(hex: string): BlossomColorPickerValue {
  const { h, s, l } = hexToHsl(hex);
  return { hue: h, saturation: s, lightness: l, alpha: 100, layer: "outer" };
}

/**
 * Accent-color control: the Basic blossom picker
 * (`@dayflow/blossom-color-picker-react`) whose center core shows the current
 * accent and blooms hues on click. Emits a `#rrggbb` hex; the widget follows the
 * app theme via its ancestor `.dark` class.
 *
 * Seed with `defaultValue` (not controlled `value`) and a stable `onChange`: the
 * React wrapper re-applies `value`/`onChange` imperatively whenever their
 * identity changes, which — since our accent state updates on every drag tick —
 * would otherwise reset the picker mid-drag and make the slider stutter.
 */
export function PrimaryColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const handleChange = useCallback(
    (color: BlossomColorPickerColor) => onChange(color.hex),
    [onChange]
  );
  return (
    <BlossomColorPicker
      defaultValue={_toValue(value)}
      showCoreColor
      adaptivePositioning
      coreSize={20}
      onChange={handleChange}
    />
  );
}
