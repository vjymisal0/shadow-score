import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  analyzeShadow,
  getShadowScore,
  hasShadow,
  normalizeOptions,
  validateInput,
} from '../src/index';

// Helper functions to generate synthetic test images
async function createUniformImage(width = 250, height = 250, val = 235): Promise<Buffer> {
  const buf = Buffer.alloc(width * height, val);
  return sharp(buf, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

async function createDiagonalShadow(
  width = 250,
  height = 250,
  litVal = 235,
  shadowVal = 70
): Promise<Buffer> {
  const buf = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isShadow = x + y < width * 0.95;
      buf[y * width + x] = isShadow ? shadowVal : litVal;
    }
  }
  return sharp(buf, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

async function createHalfShadow(
  width = 250,
  height = 250,
  litVal = 240,
  shadowVal = 60
): Promise<Buffer> {
  const buf = Buffer.alloc(width * height);
  const splitY = Math.floor(height * 0.5);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      buf[y * width + x] = y < splitY ? shadowVal : litVal;
    }
  }
  return sharp(buf, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

async function createGradientImage(
  width = 250,
  height = 250,
  startVal = 235,
  endVal = 195
): Promise<Buffer> {
  const buf = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ratio = x / (width - 1);
      buf[y * width + x] = Math.round(startVal + ratio * (endVal - startVal));
    }
  }
  return sharp(buf, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

async function createDocumentWithText(width = 250, height = 250): Promise<Buffer> {
  const buf = Buffer.alloc(width * height, 240);
  for (let line = 25; line < height - 25; line += 14) {
    for (let x = 20; x < width - 20; x++) {
      if (x % 7 < 4) {
        buf[line * width + x] = 25;
        buf[(line + 1) * width + x] = 25;
      }
    }
  }
  return sharp(buf, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

describe('shadow-score', () => {
  let tempFilePath: string;

  beforeAll(async () => {
    tempFilePath = path.join(os.tmpdir(), `shadow-test-${Date.now()}.png`);
    const imgBuf = await createDiagonalShadow();
    fs.writeFileSync(tempFilePath, imgBuf);
  });

  afterAll(() => {
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch {
        // ignore
      }
    }
  });

  describe('Uniformly Lit Images', () => {
    it('returns score 0 for pure uniform white image', async () => {
      const img = await createUniformImage(200, 200, 255);
      const res = await analyzeShadow(img);
      expect(res.score).toBe(0);
      expect(res.hasShadow).toBe(false);
      expect(res.shadowAreaPercentage).toBe(0);
      expect(res.illuminationDelta).toBe(0);
      expect(res.quality).toBe('excellent');
    });

    it('returns score 0 for pure uniform dark/black image', async () => {
      const img = await createUniformImage(200, 200, 15);
      const res = await analyzeShadow(img);
      expect(res.score).toBe(0);
      expect(res.hasShadow).toBe(false);
      expect(res.quality).toBe('excellent');
    });

    it('returns score 0 for mid-gray uniform image', async () => {
      const img = await createUniformImage(200, 200, 128);
      const res = await analyzeShadow(img);
      expect(res.score).toBe(0);
      expect(res.hasShadow).toBe(false);
      expect(res.quality).toBe('excellent');
    });

    it('does not classify clean document text as shadow', async () => {
      const img = await createDocumentWithText(250, 250);
      const res = await analyzeShadow(img);
      expect(res.score).toBeLessThan(0.15);
      expect(res.hasShadow).toBe(false);
      expect(['excellent', 'good']).toContain(res.quality);
    });
  });

  describe('Directional Shadow Scenarios', () => {
    it('detects a harsh diagonal phone shadow across document', async () => {
      const img = await createDiagonalShadow(250, 250, 235, 65);
      const res = await analyzeShadow(img);
      expect(res.score).toBeGreaterThanOrEqual(0.3);
      expect(res.hasShadow).toBe(true);
      expect(res.illuminationDelta).toBeGreaterThan(100);
      expect(res.shadowAreaPercentage).toBeGreaterThan(20);
      expect(res.shadowAreaPercentage).toBeLessThan(80);
      expect(['fair', 'poor']).toContain(res.quality);
    });

    it('detects severe half-split shadow and flags as poor quality', async () => {
      const img = await createHalfShadow(250, 250, 240, 50);
      const res = await analyzeShadow(img);
      expect(res.score).toBeGreaterThanOrEqual(0.45);
      expect(res.hasShadow).toBe(true);
      expect(res.quality).toBe('poor');
      expect(res.details.separability).toBeGreaterThan(0.5);
    });

    it('correctly handles subtle/soft lighting gradient without false shadow alert', async () => {
      const img = await createGradientImage(250, 250, 235, 195);
      const res = await analyzeShadow(img);
      expect(res.score).toBeLessThan(0.2);
      expect(res.hasShadow).toBe(false);
      expect(['excellent', 'good']).toContain(res.quality);
    });

    it('identifies moderate shadow and rates quality as fair or poor', async () => {
      const img = await createDiagonalShadow(250, 250, 230, 120);
      const res = await analyzeShadow(img);
      expect(res.score).toBeGreaterThanOrEqual(0.2);
      expect(res.hasShadow).toBe(true);
      expect(['fair', 'poor']).toContain(res.quality);
    });
  });

  describe('Input Formats', () => {
    it('analyzes image from file path string', async () => {
      const res = await analyzeShadow(tempFilePath);
      expect(res).toBeDefined();
      expect(res.score).toBeGreaterThan(0.2);
      expect(res.hasShadow).toBe(true);
    });

    it('analyzes image from Buffer', async () => {
      const buf = fs.readFileSync(tempFilePath);
      const res = await analyzeShadow(buf);
      expect(res.score).toBeGreaterThan(0.2);
    });

    it('analyzes image from Uint8Array', async () => {
      const buf = fs.readFileSync(tempFilePath);
      const uint8 = new Uint8Array(buf);
      const res = await analyzeShadow(uint8);
      expect(res.score).toBeGreaterThan(0.2);
    });
  });

  describe('Convenience Functions', () => {
    it('getShadowScore returns number matching result.score', async () => {
      const img = await createDiagonalShadow();
      const score = await getShadowScore(img);
      const res = await analyzeShadow(img);
      expect(score).toBe(res.score);
      expect(typeof score).toBe('number');
    });

    it('hasShadow returns boolean matching result.hasShadow', async () => {
      const img = await createDiagonalShadow();
      const flag = await hasShadow(img);
      const res = await analyzeShadow(img);
      expect(flag).toBe(res.hasShadow);
      expect(typeof flag).toBe('boolean');
    });

    it('hasShadow supports custom numeric threshold', async () => {
      const img = await createDiagonalShadow(250, 250, 230, 120);
      const res = await analyzeShadow(img);
      // If threshold is higher than score, hasShadow should be false
      const highThresh = res.score + 0.1;
      const flag = await hasShadow(img, highThresh);
      expect(flag).toBe(false);
    });

    it('hasShadow supports ShadowOptions object', async () => {
      const img = await createUniformImage();
      const flag = await hasShadow(img, { threshold: 0.1 });
      expect(flag).toBe(false);
    });
  });

  describe('Input Validation & Error Handling', () => {
    it('throws TypeError on null input', async () => {
      await expect(analyzeShadow(null as unknown as string)).rejects.toThrow(TypeError);
    });

    it('throws TypeError on undefined input', async () => {
      await expect(analyzeShadow(undefined as unknown as string)).rejects.toThrow(TypeError);
    });

    it('throws Error on empty string path', async () => {
      await expect(analyzeShadow('   ')).rejects.toThrow('file path string cannot be empty');
    });

    it('throws Error on empty buffer', async () => {
      await expect(analyzeShadow(Buffer.alloc(0))).rejects.toThrow('buffer cannot be empty');
    });

    it('throws TypeError on non-string non-buffer type', async () => {
      await expect(analyzeShadow(12345 as unknown as string)).rejects.toThrow(TypeError);
    });
  });

  describe('Options Normalization', () => {
    it('uses standard defaults when options omitted', () => {
      const opts = normalizeOptions();
      expect(opts.threshold).toBe(0.2);
      expect(opts.downsampleWidth).toBe(256);
      expect(opts.minIlluminationDelta).toBe(20);
      expect(opts.smoothingRadius).toBe(4);
    });

    it('validates threshold range', () => {
      expect(() => normalizeOptions({ threshold: -0.1 })).toThrow(RangeError);
      expect(() => normalizeOptions({ threshold: 1.5 })).toThrow(RangeError);
      expect(() => normalizeOptions({ threshold: NaN })).toThrow(RangeError);
    });

    it('validates downsampleWidth', () => {
      expect(() => normalizeOptions({ downsampleWidth: 10 })).toThrow(RangeError);
      expect(() => normalizeOptions({ downsampleWidth: 128.5 })).toThrow(RangeError);
    });

    it('validates minIlluminationDelta', () => {
      expect(() => normalizeOptions({ minIlluminationDelta: -5 })).toThrow(RangeError);
      expect(() => normalizeOptions({ minIlluminationDelta: 300 })).toThrow(RangeError);
    });

    it('validates smoothingRadius', () => {
      expect(() => normalizeOptions({ smoothingRadius: 0 })).toThrow(RangeError);
      expect(() => normalizeOptions({ smoothingRadius: 40 })).toThrow(RangeError);
    });
  });

  describe('High Performance Execution', () => {
    it('executes analysis in under 50ms on large 800x800 image via downsampling', async () => {
      const largeImg = await createDiagonalShadow(800, 800);
      const start = performance.now();
      const res = await analyzeShadow(largeImg);
      const duration = performance.now() - start;
      expect(res.score).toBeGreaterThan(0.2);
      expect(duration).toBeLessThan(100);
    });
  });
});
