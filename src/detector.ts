import sharp from 'sharp';
import type { ShadowOptions, ShadowResult, ShadowDetails } from './types';
import { normalizeOptions, validateInput } from './utils';

/**
 * Applies a separable 2D box filter to eliminate high-frequency details (like fine text)
 * and extract the underlying illumination field.
 */
function extractIlluminationMap(
  src: Uint8Array,
  width: number,
  height: number,
  radius: number
): Uint8Array {
  const temp = new Uint8Array(width * height);
  const dst = new Uint8Array(width * height);
  const div = 2 * radius + 1;

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let i = -radius; i <= radius; i++) {
      const c = i < 0 ? 0 : (i >= width ? width - 1 : i);
      sum += src[row + c]!;
    }
    for (let x = 0; x < width; x++) {
      temp[row + x] = Math.round(sum / div);
      const removeX = x - radius;
      const addX = x + radius + 1;
      const removeVal = src[row + (removeX < 0 ? 0 : removeX)]!;
      const addVal = src[row + (addX >= width ? width - 1 : addX)]!;
      sum += addVal - removeVal;
    }
  }

  // Vertical pass
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let i = -radius; i <= radius; i++) {
      const r = i < 0 ? 0 : (i >= height ? height - 1 : i);
      sum += temp[r * width + x]!;
    }
    for (let y = 0; y < height; y++) {
      dst[y * width + x] = Math.round(sum / div);
      const removeY = y - radius;
      const addY = y + radius + 1;
      const removeVal = temp[(removeY < 0 ? 0 : removeY) * width + x]!;
      const addVal = temp[(addY >= height ? height - 1 : addY) * width + x]!;
      sum += addVal - removeVal;
    }
  }

  return dst;
}

/**
 * Measures the ratio of the largest connected shadow cluster to total shadow pixels.
 */
function computeContiguity(
  isShadow: Uint8Array,
  width: number,
  height: number,
  totalShadowPixels: number
): number {
  if (totalShadowPixels === 0) return 0;

  const totalPixels = width * height;
  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  let maxClusterSize = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const startIdx = y * width + x;
      if (visited[startIdx] === 1 || isShadow[startIdx] === 0) continue;

      let head = 0;
      let tail = 0;
      queue[tail++] = startIdx;
      visited[startIdx] = 1;
      let clusterSize = 0;

      while (head < tail) {
        const curr = queue[head++]!;
        clusterSize++;
        const cy = Math.floor(curr / width);
        const cx = curr % width;

        if (cx > 0) {
          const n = curr - 1;
          if (visited[n] === 0 && isShadow[n] === 1) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
        if (cx < width - 1) {
          const n = curr + 1;
          if (visited[n] === 0 && isShadow[n] === 1) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
        if (cy > 0) {
          const n = curr - width;
          if (visited[n] === 0 && isShadow[n] === 1) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
        if (cy < height - 1) {
          const n = curr + width;
          if (visited[n] === 0 && isShadow[n] === 1) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
      }

      if (clusterSize > maxClusterSize) {
        maxClusterSize = clusterSize;
      }
    }
  }

  return maxClusterSize / totalShadowPixels;
}

/**
 * Analyzes an image for directional shadows using Otsu bimodal luminance segmentation
 * and spatial illumination gradient analysis.
 *
 * @param input - Image file path, Buffer, or Uint8Array.
 * @param options - Configuration options for shadow analysis.
 * @returns Detailed ShadowResult object.
 */
export async function analyzeShadow(
  input: string | Buffer | Uint8Array,
  options?: ShadowOptions
): Promise<ShadowResult> {
  validateInput(input);
  const opts = normalizeOptions(options);

  // 1. Downsample and convert to raw grayscale buffer
  const imagePipeline = sharp(input);
  const { data, info } = await imagePipeline
    .resize({ width: opts.downsampleWidth, withoutEnlargement: true })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const totalPixels = width * height;

  if (totalPixels === 0) {
    throw new Error('Image contains no pixel data.');
  }

  // 2. Extract smooth illumination field (removing high-frequency text & fine textures)
  const illum = extractIlluminationMap(data, width, height, opts.smoothingRadius);

  // 3. Compute histogram, global mean, and total variance
  const hist = new Int32Array(256);
  let totalSum = 0;
  for (let i = 0; i < totalPixels; i++) {
    const val = illum[i]!;
    hist[val]++;
    totalSum += val;
  }

  const meanT = totalSum / totalPixels;
  let varT = 0;
  for (let i = 0; i < 256; i++) {
    const count = hist[i]!;
    if (count > 0) {
      const diff = i - meanT;
      varT += count * diff * diff;
    }
  }
  varT /= totalPixels;

  // If variance is negligible, image lighting is completely uniform
  if (varT < 1.0) {
    const roundedMean = Number(meanT.toFixed(2));
    return {
      score: 0,
      hasShadow: false,
      shadowAreaPercentage: 0,
      illuminationDelta: 0,
      quality: 'excellent',
      details: {
        litLuminance: roundedMean,
        shadowLuminance: roundedMean,
        otsuThreshold: Math.round(meanT),
        separability: 0,
        boundaryGradient: 0,
      },
    };
  }

  // 4. Otsu's bimodal threshold search to maximize between-class variance
  let bestT = 128;
  let maxBetweenVar = 0;
  let weight0 = 0;
  let sum0 = 0;

  for (let t = 0; t < 255; t++) {
    const count = hist[t]!;
    weight0 += count;
    if (weight0 === 0) continue;
    const weight1 = totalPixels - weight0;
    if (weight1 === 0) break;

    sum0 += t * count;
    const mean0 = sum0 / weight0;
    const mean1 = (totalSum - sum0) / weight1;
    const meanDiff = mean1 - mean0;
    const betweenVar = (weight0 * weight1 * meanDiff * meanDiff) / (totalPixels * totalPixels);

    if (betweenVar > maxBetweenVar) {
      maxBetweenVar = betweenVar;
      bestT = t;
    }
  }

  // Calculate class metrics at best threshold
  let shadowCount = 0;
  let shadowSum = 0;
  let litCount = 0;
  let litSum = 0;

  const isShadow = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    const val = illum[i]!;
    if (val <= bestT) {
      isShadow[i] = 1;
      shadowCount++;
      shadowSum += val;
    } else {
      litCount++;
      litSum += val;
    }
  }

  const shadowLuminance = shadowCount > 0 ? shadowSum / shadowCount : 0;
  const litLuminance = litCount > 0 ? litSum / litCount : meanT;
  const illuminationDelta = Math.max(0, litLuminance - shadowLuminance);
  const shadowAreaPercentage = (shadowCount / totalPixels) * 100;
  const separability = Math.min(1.0, maxBetweenVar / varT);

  // 5. Spatial illumination gradient at the shadow boundary
  let boundaryGradientSum = 0;
  let boundaryPixelCount = 0;

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = rowOffset + x;
      if (isShadow[idx] === 1) {
        if (
          isShadow[idx - 1] === 0 ||
          isShadow[idx + 1] === 0 ||
          isShadow[idx - width] === 0 ||
          isShadow[idx + width] === 0
        ) {
          const gx = (illum[idx + 1]! - illum[idx - 1]!) * 0.5;
          const gy = (illum[idx + width]! - illum[idx - width]!) * 0.5;
          boundaryGradientSum += Math.sqrt(gx * gx + gy * gy);
          boundaryPixelCount++;
        }
      }
    }
  }

  const avgBoundaryGradient =
    boundaryPixelCount > 0 ? boundaryGradientSum / boundaryPixelCount : 0;

  // 6. Spatial contiguity of the shadow
  const contiguity = computeContiguity(isShadow, width, height, shadowCount);

  // 7. Calculate normalized shadow severity score (0.0 to 1.0)
  let score = 0;

  if (illuminationDelta >= opts.minIlluminationDelta && shadowAreaPercentage > 0) {
    // Delta factor: ramp from minIlluminationDelta up to delta ~ 120
    const deltaRange = Math.max(1, 120 - opts.minIlluminationDelta);
    const fDelta = Math.min(1.0, (illuminationDelta - opts.minIlluminationDelta) / deltaRange);

    // Separability factor (how clearly bimodal the distribution is)
    const fSep = Math.min(1.0, Math.max(0.0, (separability - 0.25) / 0.55));

    // Contrast ratio factor: (lit - shadow) / (lit + shadow)
    const contrastRatio = illuminationDelta / (litLuminance + shadowLuminance + 1e-5);
    const fContrast = Math.min(1.0, contrastRatio / 0.45);

    // Boundary gradient factor (harsh directional shadows have sharper boundaries than gentle ambient gradients)
    const fGrad = Math.min(1.0, avgBoundaryGradient / 8.0);
    const gradientTerm = 0.65 + 0.35 * fGrad;

    // Area factor: shadows covering 5% to 75% are typical directional shadows.
    // If area < 5%, linearly ramp up. If area > 75%, ramp down towards 95% (underexposed photo, not a directional shadow).
    let fArea = 1.0;
    if (shadowAreaPercentage < 5) {
      fArea = Math.max(0.0, shadowAreaPercentage / 5.0);
    } else if (shadowAreaPercentage > 75) {
      fArea = Math.max(0.0, (95 - shadowAreaPercentage) / 20.0);
    }

    // Lit brightness factor: if the lit region itself is dark (< 60), the entire image is underexposed
    const fLit = Math.min(1.0, litLuminance / 60.0);

    // Contiguity factor: directional shadows are clustered, not random speckles
    const fContig = 0.4 + 0.6 * Math.min(1.0, Math.max(0.0, (contiguity - 0.2) / 0.5));

    const contrastTerm = 0.5 * fSep + 0.5 * fContrast;
    const rawScore = fDelta * contrastTerm * gradientTerm * fArea * fLit * fContig;
    score = Math.max(0.0, Math.min(1.0, rawScore));
  }

  score = Number(score.toFixed(4));
  const hasShadowResult = score >= opts.threshold;

  // Qualitative rating
  let quality: 'excellent' | 'good' | 'fair' | 'poor';
  if (score < 0.1) {
    quality = 'excellent';
  } else if (score < 0.2) {
    quality = 'good';
  } else if (score < 0.45) {
    quality = 'fair';
  } else {
    quality = 'poor';
  }

  const details: ShadowDetails = {
    litLuminance: Number(litLuminance.toFixed(2)),
    shadowLuminance: Number(shadowLuminance.toFixed(2)),
    otsuThreshold: bestT,
    separability: Number(separability.toFixed(4)),
    boundaryGradient: Number(avgBoundaryGradient.toFixed(2)),
  };

  return {
    score,
    hasShadow: hasShadowResult,
    shadowAreaPercentage: Number(shadowAreaPercentage.toFixed(2)),
    illuminationDelta: Number(illuminationDelta.toFixed(2)),
    quality,
    details,
  };
}

/**
 * Returns the normalized shadow severity score (0.0 to 1.0) for an image.
 *
 * @param input - Image file path, Buffer, or Uint8Array.
 * @param options - Optional configuration options.
 * @returns Promise resolving to shadow score (0.0 to 1.0).
 */
export async function getShadowScore(
  input: string | Buffer | Uint8Array,
  options?: ShadowOptions
): Promise<number> {
  const result = await analyzeShadow(input, options);
  return result.score;
}

/**
 * Checks whether an image has harsh shadows exceeding the threshold.
 *
 * @param input - Image file path, Buffer, or Uint8Array.
 * @param thresholdOrOptions - Number threshold (e.g. 0.2) or ShadowOptions configuration.
 * @returns Promise resolving to boolean.
 */
export async function hasShadow(
  input: string | Buffer | Uint8Array,
  thresholdOrOptions?: number | ShadowOptions
): Promise<boolean> {
  let opts: ShadowOptions | undefined;
  if (typeof thresholdOrOptions === 'number') {
    opts = { threshold: thresholdOrOptions };
  } else if (thresholdOrOptions !== undefined) {
    opts = thresholdOrOptions;
  }

  const result = await analyzeShadow(input, opts);
  return result.hasShadow;
}
