package com.dsharnessmobile.shell;

import java.util.Arrays;

/** Two seconds of PCM energy, including VAD hangover, estimate the local noise floor. */
final class VoiceActivityGate {
  private final double[] energy = new double[100];
  private final double[] sorted = new double[100];
  private int count, cursor;
  private double threshold = 0.0003;

  boolean accept(boolean voice, double rms) {
    energy[cursor] = rms;
    cursor = (cursor + 1) % energy.length;
    count = Math.min(count + 1, energy.length);
    if (count < 10 || cursor % 5 == 0) {
      System.arraycopy(energy, 0, sorted, 0, count);
      Arrays.sort(sorted, 0, count);
      // A percentile follows changing gain without treating a loud syllable as ambient noise.
      // Retain the former threshold as a ceiling; quiet rooms can use a much lower gate.
      threshold = Math.max(0.0003, Math.min(0.012, sorted[(count - 1) / 5] * 3));
    }
    return voice && rms >= threshold;
  }

  double threshold() { return threshold; }
}
