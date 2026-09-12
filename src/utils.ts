import type { ShadowOptions } from './types';

/**
 * Validates the image input parameter.
 */
export function validateInput(input: unknown): void {
  if (input === null || input === undefined) {
    throw new TypeError('Invalid image input: input must be a file path string, Buffer, or Uint8Array.');
  }

  if (typeof input === 'string') {
    if (input.trim().length === 0) {
      throw new Error('Invalid image input: file path string cannot be empty.');
    }
    return;
  }

  if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    if (input.length === 0) {
      throw new Error('Invalid image input: buffer cannot be empty.');
    }
    return;
  }

  throw new TypeError('Invalid image input: expected a file path string, Buffer, or Uint8Array.');
}

/**
 * Validates and normalizes user-provided shadow options with safe defaults.
 */
export function normalizeOptions(options?: ShadowOptions): Required<ShadowOptions> {
  const threshold = options?.threshold ?? 0.2;
  const downsampleWidth = options?.downsampleWidth ?? 256;
  const minIlluminationDelta = options?.minIlluminationDelta ?? 20;
  const smoothingRadius = options?.smoothingRadius ?? 4;

  if (typeof threshold !== 'number' || Number.isNaN(threshold) || threshold < 0 || threshold > 1) {
    throw new RangeError(`Invalid option 'threshold': expected a number between 0 and 1, got ${threshold}.`);
  }

  if (
    typeof downsampleWidth !== 'number' ||
    Number.isNaN(downsampleWidth) ||
    downsampleWidth < 16 ||
    !Number.isInteger(downsampleWidth)
  ) {
    throw new RangeError(
      `Invalid option 'downsampleWidth': expected an integer >= 16, got ${downsampleWidth}.`
    );
  }

  if (
    typeof minIlluminationDelta !== 'number' ||
    Number.isNaN(minIlluminationDelta) ||
    minIlluminationDelta < 0 ||
    minIlluminationDelta > 255
  ) {
    throw new RangeError(
      `Invalid option 'minIlluminationDelta': expected a number between 0 and 255, got ${minIlluminationDelta}.`
    );
  }

  if (
    typeof smoothingRadius !== 'number' ||
    Number.isNaN(smoothingRadius) ||
    smoothingRadius < 1 ||
    smoothingRadius > 32 ||
    !Number.isInteger(smoothingRadius)
  ) {
    throw new RangeError(
      `Invalid option 'smoothingRadius': expected an integer between 1 and 32, got ${smoothingRadius}.`
    );
  }

  return {
    threshold,
    downsampleWidth,
    minIlluminationDelta,
    smoothingRadius,
  };
}
