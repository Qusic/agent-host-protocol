/**
 * Error Codes — Source of truth for all AHP error code definitions.
 *
 * @module errors
 * @description AHP uses JSON-RPC 2.0 error codes. In addition to the standard
 * JSON-RPC codes, AHP defines application-specific error codes in the `-32000`
 * to `-32099` range.
 */

// ─── Standard JSON-RPC Codes ─────────────────────────────────────────────────

/**
 * Standard JSON-RPC 2.0 error codes.
 *
 * @category Standard JSON-RPC Codes
 */
export const JsonRpcErrorCodes = {
  /** Invalid JSON */
  ParseError: -32700,
  /** Not a valid JSON-RPC request */
  InvalidRequest: -32600,
  /** Unknown method name */
  MethodNotFound: -32601,
  /** Invalid method parameters */
  InvalidParams: -32602,
  /** Unspecified server error */
  InternalError: -32603,
} as const;

// ─── AHP Application Codes ──────────────────────────────────────────────────

/**
 * AHP application-specific error codes.
 *
 * @category AHP Application Codes
 * @version 1
 */
export const AhpErrorCodes = {
  /** The referenced session URI does not exist */
  SessionNotFound: -32001,
  /** The requested agent provider is not registered */
  ProviderNotFound: -32002,
  /** A session with the given URI already exists */
  SessionAlreadyExists: -32003,
  /** The operation requires no active turn, but one is in progress */
  TurnInProgress: -32004,
  /** The client's protocol version is not supported by the server */
  UnsupportedProtocolVersion: -32005,
  /** The requested content URI does not exist */
  ContentNotFound: -32006,
} as const;

/** Union type of all AHP application error codes. */
export type AhpErrorCode = (typeof AhpErrorCodes)[keyof typeof AhpErrorCodes];

/** Union type of all JSON-RPC error codes. */
export type JsonRpcErrorCode = (typeof JsonRpcErrorCodes)[keyof typeof JsonRpcErrorCodes];
