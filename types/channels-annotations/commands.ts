/**
 * Annotations Channel Commands — Client-driven mutations of an
 * `ahp-session:/<uuid>/annotations` channel.
 *
 * The protocol forbids empty annotations, so annotation and first-entry
 * creation are fused into {@link CreateAnnotationParams |
 * `createAnnotation`} and the server collapses an annotation whose last
 * entry is deleted into an {@link AnnotationsRemovedAction}. Every
 * accepted command echoes back through the normal `annotations/*` action
 * stream on the channel.
 *
 * @module channels-annotations/commands
 */

import type { URI, StringOrMarkdown, TextRange } from '../common/state.js';
import type { BaseParams } from '../common/commands.js';
import type { NewAnnotationEntry } from './state.js';

// ─── createAnnotation ─────────────────────────────────────────────────────

/**
 * Create a new {@link Annotation} anchored to a file from a specific
 * turn, optionally narrowed to a range within that file.
 *
 * The initial entry is required — the protocol forbids empty annotations,
 * so annotation creation and first-entry creation are fused into one
 * command. The created annotation always starts unresolved
 * ({@link Annotation.resolved} is `false`). The server assigns both
 * {@link CreateAnnotationResult.annotationId} and
 * {@link CreateAnnotationResult.entryId}, then broadcasts an
 * {@link AnnotationsSetAction} on the channel.
 *
 * @category Commands
 * @method createAnnotation
 * @direction Client → Server
 * @messageType Request
 * @version 3
 */
export interface CreateAnnotationParams extends BaseParams {
  /** The annotations channel URI, e.g. `ahp-session:/<uuid>/annotations`. */
  channel: URI;
  /** Turn whose file versions {@link resource} + {@link range} address. */
  turnId: string;
  /** Anchored file URI. */
  resource: URI;
  /**
   * Anchored range within {@link resource}. When omitted the annotation is
   * anchored to the entire file.
   */
  range?: TextRange;
  /** First entry in the annotation. The server assigns its {@link AnnotationEntry.id}. */
  entry: NewAnnotationEntry;
}

/**
 * Result of {@link CreateAnnotationParams | `createAnnotation`}.
 *
 * @category Commands
 */
export interface CreateAnnotationResult {
  /** Server-assigned {@link Annotation.id}. */
  annotationId: string;
  /** Server-assigned {@link AnnotationEntry.id} of the initial entry. */
  entryId: string;
}

// ─── updateAnnotation ─────────────────────────────────────────────────────

/**
 * Re-anchor or resolve an existing {@link Annotation} — typically used
 * to re-pin an annotation to a different range or a newer turn after an
 * edit, or to mark the annotation {@link Annotation.resolved | resolved}
 * (or re-open it). Entries themselves are not modified by this command;
 * use {@link AddAnnotationEntryParams | `addAnnotationEntry`},
 * {@link EditAnnotationEntryParams | `editAnnotationEntry`}, or
 * {@link DeleteAnnotationEntryParams | `deleteAnnotationEntry`} for that.
 *
 * Omitted optional fields preserve their current value. The server
 * echoes the resulting annotation state as an {@link AnnotationsSetAction}.
 *
 * @category Commands
 * @method updateAnnotation
 * @direction Client → Server
 * @messageType Request
 * @version 3
 */
export interface UpdateAnnotationParams extends BaseParams {
  /** The annotations channel URI. */
  channel: URI;
  /** The {@link Annotation.id} to update. */
  annotationId: string;
  /** New {@link Annotation.turnId}, if changing. */
  turnId?: string;
  /** New anchored file URI, if changing. */
  resource?: URI;
  /** New anchored range, if changing. */
  range?: TextRange;
  /** New {@link Annotation.resolved} state, if changing. */
  resolved?: boolean;
}

// ─── deleteAnnotation ─────────────────────────────────────────────────────

/**
 * Delete an entire annotation (and every entry it contains). The
 * server echoes an {@link AnnotationsRemovedAction} on the channel.
 *
 * @category Commands
 * @method deleteAnnotation
 * @direction Client → Server
 * @messageType Request
 * @version 3
 */
export interface DeleteAnnotationParams extends BaseParams {
  /** The annotations channel URI. */
  channel: URI;
  /** The {@link Annotation.id} to delete. */
  annotationId: string;
}

// ─── addAnnotationEntry ──────────────────────────────────────────────────────────────

/**
 * Append a new {@link AnnotationEntry} to an existing annotation. The
 * server assigns the resulting {@link AnnotationEntry.id} and echoes an
 * {@link AnnotationsEntrySetAction}.
 *
 * @category Commands
 * @method addAnnotationEntry
 * @direction Client → Server
 * @messageType Request
 * @version 3
 */
export interface AddAnnotationEntryParams extends BaseParams {
  /** The annotations channel URI. */
  channel: URI;
  /** Annotation that receives the new entry. */
  annotationId: string;
  /** Entry payload — the server assigns the id. */
  entry: NewAnnotationEntry;
}

/**
 * Result of {@link AddAnnotationEntryParams | `addAnnotationEntry`}.
 *
 * @category Commands
 */
export interface AddAnnotationEntryResult {
  /** Server-assigned {@link AnnotationEntry.id} of the new entry. */
  entryId: string;
}

// ─── editAnnotationEntry ─────────────────────────────────────────────────────────────

/**
 * Edit the body of an existing entry in place. The server echoes an
 * {@link AnnotationsEntrySetAction} carrying the updated entry.
 *
 * Only the body is mutable through this command; to change
 * {@link AnnotationEntry._meta} delete and re-create the entry.
 *
 * @category Commands
 * @method editAnnotationEntry
 * @direction Client → Server
 * @messageType Request
 * @version 3
 */
export interface EditAnnotationEntryParams extends BaseParams {
  /** The annotations channel URI. */
  channel: URI;
  /** Enclosing annotation. */
  annotationId: string;
  /** {@link AnnotationEntry.id} to edit. */
  entryId: string;
  /** New entry body. See {@link AnnotationEntry.text}. */
  text: StringOrMarkdown;
}

// ─── deleteAnnotationEntry ───────────────────────────────────────────────────────────

/**
 * Remove a single entry from an annotation.
 *
 * If the removal would leave the annotation empty (i.e. the targeted entry
 * is the only one remaining), the server collapses the annotation instead
 * — it dispatches an {@link AnnotationsRemovedAction} and the annotation
 * disappears from {@link AnnotationsState.annotations}. Otherwise the server
 * echoes an {@link AnnotationsEntryRemovedAction}.
 *
 * @category Commands
 * @method deleteAnnotationEntry
 * @direction Client → Server
 * @messageType Request
 * @version 3
 */
export interface DeleteAnnotationEntryParams extends BaseParams {
  /** The annotations channel URI. */
  channel: URI;
  /** Enclosing annotation. */
  annotationId: string;
  /** {@link AnnotationEntry.id} to remove. */
  entryId: string;
}
