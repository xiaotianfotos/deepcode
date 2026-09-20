package com.dsharnessmobile.shell;

/** Spatial profile shared by the renderer and diagnostic assertions. */
final class FoldBlurProfile {
  static float clamp(float value) { return Math.max(0f, Math.min(1f, value)); }
  static float amountForAngle(float degrees) { return clamp((170f - degrees) / 150f); }
  static float outerAmountForAngle(float degrees) { return clamp((degrees - 10f) / 150f); }
  static float extent(float amount) { return .25f + .7f * clamp(amount); }
  static float sigma(float x, float amount, float maxSigma) {
    float t = clamp(x / extent(amount));
    return maxSigma * clamp(amount) * (1f - t*t*(3f - 2f*t));
  }
}
