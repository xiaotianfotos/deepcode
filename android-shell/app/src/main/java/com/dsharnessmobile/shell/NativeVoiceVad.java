package com.dsharnessmobile.shell;

/** WebRTC VAD, one instance per capture thread, fixed 16kHz / 20ms frames. */
final class NativeVoiceVad implements AutoCloseable {
  private long handle;
  NativeVoiceVad() {
    try { System.loadLibrary("dsh_vad"); }
    catch (LinkageError e) { throw new IllegalStateException("当前安装包缺少语音活动检测组件", e); }
    handle = create();
    if (handle == 0) throw new IllegalStateException("无法启动语音活动检测");
  }
  boolean speech(byte[] pcm) {
    int result = process(handle, pcm);
    if (result < 0) throw new IllegalStateException("语音活动检测失败");
    return result == 1;
  }
  @Override public void close() { if (handle != 0) { destroy(handle); handle = 0; } }
  private static native long create();
  private static native int process(long handle, byte[] pcm);
  private static native void destroy(long handle);
}
