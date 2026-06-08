/**
 * Annotations Channel Actions — Mutations of an `ahp-session:/<uuid>/annotations`
 * channel's state.
 *
 * Every annotations action is server-only: clients drive mutations through
 * the {@link CreateAnnotationParams | `createAnnotation`},
 * {@link AddAnnotationEntryParams | `addAnnotationEntry`}, etc. commands, and
 * the server echoes the resulting state change as one of these actions.
 * Mirrors the shape of the `changeset/*` action family.
 *
 * @module channels-annotations/actions
 */

import { ActionType } from '../common/actions.js';
import type { AnnotationEntry, Annotation } from './state.js';

// ─── Annotations Actions ─────────────────────────────────────────────────────

/**
 * Upsert an {@link Annotation} in the annotations channel — adds a new
 * annotation, or replaces an existing one identified by
 * {@link Annotation.id}. When replacing, the full annotation payload
 * (including its {@link Annotation.entries | entries} list) is
 * substituted; producers SHOULD prefer {@link AnnotationsEntrySetAction}
 * for per-entry edits to keep wire updates small.
 *
 * @category Annotations Actions
 * @version 3
 */
export interface AnnotationsSetAction {
  type: ActionType.AnnotationsSet;
  /** The new or replacement annotation. MUST contain at least one entry. */
  annotation: Annotation;
}

/**
 * Remove an {@link Annotation} from the channel by its id.
 *
 * The server emits this in two cases:
 * 1. The client explicitly invoked
 *    {@link DeleteAnnotationParams | `deleteAnnotation`}.
 * 2. The client invoked {@link DeleteAnnotationEntryParams |
 *    `deleteAnnotationEntry`} on the last remaining entry in the
 *    annotation — the protocol collapses the annotation rather than
 *    leaving an empty one behind.
 *
 * @category Annotations Actions
 * @version 3
 */
export interface AnnotationsRemovedAction {
  type: ActionType.AnnotationsRemoved;
  /** The {@link Annotation.id} of the annotation to remove. */
  annotationId: string;
}

/**
 * Upsert an {@link AnnotationEntry} within an existing annotation — adds a
 * new entry, or replaces one identified by {@link AnnotationEntry.id}. If
 * {@link annotationId} does not match any current annotation the action is
 * a no-op.
 *
 * @category Annotations Actions
 * @version 3
 */
export interface AnnotationsEntrySetAction {
  type: ActionType.AnnotationsEntrySet;
  /** The {@link Annotation.id} the entry belongs to. */
  annotationId: string;
  /** The new or replacement entry. */
  entry: AnnotationEntry;
}

/**
 * Remove a single {@link AnnotationEntry} from an annotation without
 * collapsing the annotation itself. Used when more than one entry remains
 * — the server MUST dispatch {@link AnnotationsRemovedAction} instead when
 * removing the last entry would otherwise leave the annotation empty.
 *
 * If either {@link annotationId} or {@link entryId} does not match the
 * current state the action is a no-op.
 *
 * @category Annotations Actions
 * @version 3
 */
export interface AnnotationsEntryRemovedAction {
  type: ActionType.AnnotationsEntryRemoved;
  /** The {@link Annotation.id} the entry belongs to. */
  annotationId: string;
  /** The {@link AnnotationEntry.id} to remove. */
  entryId: string;
}
