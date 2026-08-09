import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";

export interface MessageDragHandleProps {
  attributes: DraggableAttributes;
  listeners: NonNullable<DraggableSyntheticListeners>;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
}
