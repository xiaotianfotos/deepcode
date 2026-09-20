package com.dsharnessmobile.shell;

/** Pure angle-to-progress policy. No Android lifecycle, pixels or device policy. */
final class FoldHingeMotion {
  private float previous = Float.NaN;
  private float origin;
  private int direction;
  private boolean settled;

  Float update(float degrees) {
    if (!Float.isFinite(degrees) || degrees < 0 || degrees > 180) return null;
    if (Float.isNaN(previous)) { previous = degrees; return null; }
    // Fold reports 178/179/180 while resting open. Do not start a transition.
    if (degrees >= 170f && previous >= 170f) { previous = degrees; return null; }
    float delta = degrees - previous;
    if (Math.abs(delta) < 1f) return null;
    int next = delta < 0 ? -1 : 1;
    if (direction == 0 || (next != direction && Math.abs(delta) >= 2f)) {
      direction = next; origin = previous; settled = false;
    }
    previous = degrees;
    if (settled) {
      if (degrees <= 5 || degrees >= 165) direction = 0;
      return null;
    }
    float span = direction < 0 ? Math.max(12f, origin - 5f) : 35f;
    return Math.max(0f, Math.min(1f, Math.abs(degrees - origin) / span));
  }
  void settle() { settled = true; }
  void rearm() { direction = 0; settled = false; }
  void reset() { previous = Float.NaN; direction = 0; settled = false; }
}
