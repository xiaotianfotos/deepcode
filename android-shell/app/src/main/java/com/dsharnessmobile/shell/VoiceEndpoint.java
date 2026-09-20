package com.dsharnessmobile.shell;

/** Endpoint clock advances from recorded PCM, not UI polling or wall-clock timers. */
final class VoiceEndpoint {
  static final int SILENCE_MS = 5000;
  private int elapsedMs, lastVoiceMs, consecutiveVoiceMs;
  private boolean heardSpeech;
  void accept(boolean speech, int frameMs) {
    elapsedMs += frameMs;
    if (speech) {
      consecutiveVoiceMs += frameMs;
      if (consecutiveVoiceMs >= 60) { heardSpeech = true; lastVoiceMs = elapsedMs; }
    } else consecutiveVoiceMs = 0;
  }
  boolean heardSpeech() { return heardSpeech; }
  int lastVoiceMs() { return lastVoiceMs; }
  int silenceMs() { return heardSpeech ? elapsedMs - lastVoiceMs : elapsedMs; }
  boolean finished() { return silenceMs() >= SILENCE_MS; }
}
