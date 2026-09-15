# shadow-score 🌓

[![npm version](https://img.shields.io/npm/v/shadow-score.svg?style=flat-square)](https://www.npmjs.com/package/shadow-score)
[![CI](https://github.com/vjymisal0/shadow-score/actions/workflows/ci.yml/badge.svg)](https://github.com/vjymisal0/shadow-score/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/shadow-score.svg?style=flat-square)](https://github.com/vjymisal0/shadow-score/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg?style=flat-square)](https://www.typescriptlang.org)
[![Build & Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg?style=flat-square)](https://github.com/vjymisal0/shadow-score)
[![Downloads](https://img.shields.io/npm/dm/shadow-score.svg?style=flat-square)](https://www.npmjs.com/package/shadow-score)

> Detect and quantify **harsh directional shadows** cast across documents, paper, or identity cards (such as smartphone camera shadows during document capture) using **Otsu bimodal luminance segmentation** and **spatial illumination gradient analysis** with [`sharp`](https://sharp.pixelplumbing.com/).

Companion package to [**`blur-score`**](https://www.npmjs.com/package/blur-score), [**`exposure-score`**](https://www.npmjs.com/package/exposure-score), [**`glare-score`**](https://www.npmjs.com/package/glare-score), and [**`contrast-score`**](https://www.npmjs.com/package/contrast-score).

---

## 🌟 Why `shadow-score`?

When users scan identity cards, receipts, or contracts with a smartphone, holding the phone directly over the document casts a harsh, dark shadow. Overhead room lights exacerbate this by creating high-contrast illumination gradients across the paper.

These directional shadows severely impair downstream computer vision and OCR:
- **Binarization failures**: Standard adaptive thresholding algorithms (Otsu, Bradley, Sauvola) create heavy dark blotches or wash out text along shadow boundaries.
- **Silent OCR character dropouts**: Character recognition confidence plummets across shadowed regions in Tesseract, AWS Textract, and Google Cloud Vision.
- **KYC rejection**: ID card verifiers fail automated document authenticity checks due to non-uniform illumination.

`shadow-score` separates the low-frequency **illumination layer** from high-frequency text reflectance, runs **Otsu bimodal segmentation**, and evaluates the **spatial boundary gradient** to reliably measure shadow severity in milliseconds.

### Key Highlights:
- ⚡ **Sub-Millisecond Core Processing**: Optimized TypedArray operations and downsampling via native `sharp` C++ bindings.
- 🎯 **Robust Illumination Separation**: Separable box filtering isolates macro illumination, preventing black text characters from being falsely classified as shadows.
- 📐 **Bimodal & Spatial Analysis**: Evaluates Otsu between-class variance ($\sigma_B^2 / \sigma_T^2$), illumination delta, boundary gradient, and spatial cluster contiguity.
- 📦 **Dual ESM & CommonJS**: Ships with complete ES Modules and CommonJS bundles plus strict TypeScript definitions.
- 🛡️ **Zero Runtime Dependencies**: Depends strictly on standard `sharp`.

---

## 📦 Installation

```bash
npm install shadow-score sharp
```

Or using your preferred package manager:

```bash
# pnpm
pnpm add shadow-score sharp

# yarn
yarn add shadow-score sharp

# bun
bun add shadow-score sharp
```

> **Note**: `sharp` is required as a peer/direct dependency for high-performance image decoding and downsampling.

---

## 🚀 Quick Start

### Basic Usage

```ts
import { analyzeShadow, hasShadow, getShadowScore } from 'shadow-score';

// 1. Boolean check (ideal for client retake prompts)
const isShadowed = await hasShadow('./scanned-id.jpg');
if (isShadowed) {
  console.log('⚠️ Harsh shadow detected! Please adjust your lighting or angle.');
}

// 2. Normalized shadow score (0.0 = uniform lighting, 1.0 = heavy dark shadow)
const score = await getShadowScore('./receipt.png');
console.log(`Shadow Score: ${score}`); // e.g. 0.4215

// 3. Full analysis with illumination metrics and quality rating
const result = await analyzeShadow('./passport-page.jpg');
console.log(result);
/*
{
  score: 0.4821,
  hasShadow: true,
  shadowAreaPercentage: 38.45,
  illuminationDelta: 118.60,
  quality: 'poor',
  details: {
    litLuminance: 224.15,
    shadowLuminance: 105.55,
    otsuThreshold: 156,
    separability: 0.7842,
    boundaryGradient: 14.82
  }
}
*/
```

---

## 📖 API Reference

### `analyzeShadow(input, options?): Promise<ShadowResult>`

Performs comprehensive directional shadow analysis on an image.

- **`input`**: File path string, `Buffer`, or `Uint8Array`.
- **`options`**: Optional configuration object ([`ShadowOptions`](#shadowoptions)).
- **Returns**: `Promise<ShadowResult>`

#### `ShadowResult`

```ts
export interface ShadowResult {
  /**
   * Normalized shadow severity score from 0.0 (uniform lighting / shadow-free) to 1.0 (heavy dark shadow).
   */
  score: number;

  /**
   * Whether the image exceeds the shadow threshold (score >= threshold).
   * @default threshold: 0.2
   */
  hasShadow: boolean;

  /**
   * Percentage of total image area under shadow (0.0 to 100.0).
   */
  shadowAreaPercentage: number;

  /**
   * Difference in average luminance between lit and shadowed regions (0.0 to 255.0).
   */
  illuminationDelta: number;

  /**
   * Qualitative lighting classification:
   * - 'excellent': Uniform, pristine illumination (< 0.10).
   * - 'good': Minor lighting variation or faint shadow, fully legible (< 0.20).
   * - 'fair': Noticeable directional shadow, may degrade OCR accuracy (< 0.45).
   * - 'poor': Severe, harsh shadow obscuring document content (>= 0.45).
   */
  quality: 'excellent' | 'good' | 'fair' | 'poor';

  /**
   * Low-level illumination and segmentation diagnostics.
   */
  details: ShadowDetails;
}
```

#### `ShadowDetails`

```ts
export interface ShadowDetails {
  /** Average luminance of the lit region (0.0 to 255.0). */
  litLuminance: number;
  /** Average luminance of the shadowed region (0.0 to 255.0). */
  shadowLuminance: number;
  /** Optimal Otsu threshold (0-255) computed across the illumination field. */
  otsuThreshold: number;
  /** Otsu bimodal separability ratio (eta = between-class variance / total variance, 0.0 to 1.0). */
  separability: number;
  /** Average directional spatial gradient magnitude along the shadow transition boundary. */
  boundaryGradient: number;
}
```

---

### `getShadowScore(input, options?): Promise<number>`

Convenience method that returns only the normalized shadow severity score (`0.0` to `1.0`).

```ts
const score = await getShadowScore(imageBuffer);
```

---

### `hasShadow(input, thresholdOrOptions?): Promise<boolean>`

Convenience method returning `true` if the detected shadow score meets or exceeds the threshold.

```ts
// Using default threshold (0.2)
const flagged = await hasShadow('./document.jpg');

// Custom numeric threshold
const strict = await hasShadow('./document.jpg', 0.15);

// Custom options object
const custom = await hasShadow('./document.jpg', {
  threshold: 0.25,
  downsampleWidth: 384,
});
```

---

### `ShadowOptions`

Configurable parameters to customize detection sensitivity:

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `threshold` | `number` | `0.2` | Score cutoff for `hasShadow`. Image is flagged when `score >= threshold`. |
| `downsampleWidth` | `number` | `256` | Target width downsampled before analysis. Ensures sub-millisecond execution. |
| `minIlluminationDelta` | `number` | `20` | Minimum luminance drop (0-255) between lit and shadow zones to trigger detection. |
| `smoothingRadius` | `number` | `4` | Radius of the separable 2D box filter to eliminate text characters and isolate illumination. |

---

## 🔬 How the Algorithm Works

```
Raw Input Image
      │
      ▼
Downsample (e.g. 256px) & Grayscale Conversion
      │
      ▼
Separable 2D Box Filter (Eliminates fine text & isolates illumination field L)
      │
      ▼
Otsu Bimodal Thresholding (Maximizes between-class variance σ_B² / σ_T²)
      │
      ├───────────────────────────────┐
      ▼                               ▼
Illumination Delta & Area %      Boundary Spatial Gradient Analysis
(Lit Mean vs. Shadow Mean)       (|∇L| step along shadow penumbra)
      │                               │
      └───────────────┬───────────────┘
                      ▼
        Spatial Cluster Contiguity
        (Connected Component Analysis)
                      │
                      ▼
      Normalized Shadow Score (0.0 to 1.0)
```

1. **Illumination Field Extraction**: High-resolution documents contain high-frequency reflectance details (ink letters, barcodes, signatures). A 2D separable box filter attenuates sharp, thin edges, leaving the macro ambient illumination field $L(x, y)$.
2. **Otsu Bimodal Segmentation**: Evaluates histogram bimodality across $L(x, y)$ by finding threshold $t^*$ that maximizes between-class variance $\sigma_B^2(t)$. This segments candidate lit and candidate shadowed zones.
3. **Boundary Spatial Gradient**: Directional shadows created by phones or hands feature a distinct penumbra boundary with a sharp illumination drop $|\nabla L|$. Diffuse room light gradients have near-zero boundary gradient and are scored low.
4. **Spatial Cluster Contiguity**: Connected component analysis ensures that shadow pixels form a cohesive regional obstruction rather than scattered noise or image borders.
5. **Calibrated Severity Score**: The combined factors produce a normalized, scale-invariant score from `0.0` (perfectly uniform) to `1.0` (harsh, dark shadow obscuring document).

---

## 💡 Practical Examples

### Pre-OCR Document Quality Gate

```ts
import { analyzeShadow } from 'shadow-score';

async function preprocessDocument(imagePath: string) {
  const shadow = await analyzeShadow(imagePath);

  if (shadow.score >= 0.45) {
    throw new Error(
      `Document rejected: heavy shadow detected (${shadow.shadowAreaPercentage}% of image affected). Please retake photo with even lighting.`
    );
  }

  if (shadow.hasShadow) {
    console.warn(
      `Moderate shadow detected (score: ${shadow.score}). Applying local adaptive illumination correction before OCR...`
    );
  }

  return shadow;
}
```

### KYC ID Card Verification Pipeline

Combine `shadow-score` with its companion libraries for comprehensive quality verification:

```ts
import { hasBlur } from 'blur-score';
import { hasGlare } from 'glare-score';
import { hasShadow } from 'shadow-score';

async function validateIdCard(imageBuffer: Buffer) {
  const [blurry, glared, shadowed] = await Promise.all([
    hasBlur(imageBuffer),
    hasGlare(imageBuffer),
    hasShadow(imageBuffer),
  ]);

  if (blurry) return { valid: false, reason: 'Image is blurry. Please hold camera steady.' };
  if (glared) return { valid: false, reason: 'Flash reflection detected. Please turn off camera flash.' };
  if (shadowed) return { valid: false, reason: 'Phone shadow detected. Please avoid blocking overhead light.' };

  return { valid: true };
}
```

---

## 🔗 Companion Packages

Build an end-to-end automated image quality and document preprocessing pipeline:

| Package | Purpose | Detection Method |
| :--- | :--- | :--- |
| [**`shadow-score`**](https://www.npmjs.com/package/shadow-score) | Harsh directional shadows & lighting gradients | Otsu bimodal segmentation & spatial gradient |
| [**`glare-score`**](https://www.npmjs.com/package/glare-score) | Specular flash hotspots & reflection glare | Connected component labeling & boundary contrast |
| [**`blur-score`**](https://www.npmjs.com/package/blur-score) | Defocus and motion blur detection | Modified Laplacian variance & frequency analysis |
| [**`exposure-score`**](https://www.npmjs.com/package/exposure-score) | Underexposure and overexposure detection | Luminance histogram percentile distribution |
| [**`contrast-score`**](https://www.npmjs.com/package/contrast-score) | Low contrast and washed-out text | RMS contrast & Michelson contrast metrics |

---

## 🛠️ Development & Testing

```bash
# Install dependencies
npm install

# Run test suite (15+ unit tests using synthetic test images)
npm test

# Build dual ESM/CJS bundles with TypeScript declarations
npm run build

# Run typecheck
npm run typecheck
```

---

## 📄 License

[MIT](LICENSE) © [Vijay Misal](mailto:misalvijay153@gmail.com)
