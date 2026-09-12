/**
 * Low-level illumination and segmentation diagnostics.
 */
export interface ShadowDetails {
  /**
   * Average luminance of the lit region (0.0 to 255.0).
   */
  litLuminance: number;

  /**
   * Average luminance of the shadowed region (0.0 to 255.0).
   */
  shadowLuminance: number;

  /**
   * Optimal Otsu threshold (0-255) computed across the illumination field.
   */
  otsuThreshold: number;

  /**
   * Otsu bimodal separability ratio (eta = between-class variance / total variance, 0.0 to 1.0).
   */
  separability: number;

  /**
   * Average directional spatial gradient magnitude along the shadow transition boundary.
   */
  boundaryGradient: number;
}

/**
 * Configuration options for shadow detection and quantification.
 */
export interface ShadowOptions {
  /**
   * Shadow score cutoff to determine whether an image is considered shadowed.
   * If `score >= threshold`, `hasShadow` is set to `true`.
   * @default 0.2
   */
  threshold?: number;

  /**
   * Target maximum dimension (width) to downsample the image before analysis.
   * Enables blazing-fast execution speeds (typically < 10ms, sub-millisecond core pass).
   * @default 256
   */
  downsampleWidth?: number;

  /**
   * Minimum luminance difference (0-255) required between lit and shadow regions
   * for a valid directional shadow detection. Filters out flat lighting or sensor noise.
   * @default 20
   */
  minIlluminationDelta?: number;

  /**
   * Radius of the separable box filter used to remove high-frequency text and texture details
   * and isolate the macro illumination field.
   * @default 4
   */
  smoothingRadius?: number;
}

/**
 * Result of the shadow analysis.
 */
export interface ShadowResult {
  /**
   * Normalized shadow severity score from 0.0 (uniform lighting / shadow-free) to 1.0 (heavy dark shadow).
   */
  score: number;

  /**
   * Whether the image exceeds the shadow threshold (`score >= threshold`).
   */
  hasShadow: boolean;

  /**
   * Percentage of total image area cast under shadow (0.0 to 100.0).
   */
  shadowAreaPercentage: number;

  /**
   * Difference in average luminance between lit and shadowed regions (0.0 to 255.0).
   */
  illuminationDelta: number;

  /**
   * Qualitative lighting assessment:
   * - `'excellent'`: Uniform, pristine illumination (< 0.10).
   * - `'good'`: Minor lighting variation or faint shadow, fully legible (< 0.20).
   * - `'fair'`: Noticeable directional shadow, may degrade OCR accuracy (< 0.45).
   * - `'poor'`: Severe, harsh shadow obscuring document content (>= 0.45).
   */
  quality: 'excellent' | 'good' | 'fair' | 'poor';

  /**
   * Low-level illumination and segmentation diagnostics.
   */
  details: ShadowDetails;
}
