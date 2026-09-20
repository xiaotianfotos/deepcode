package com.dsharnessmobile.shell;
import org.junit.Test;
import static org.junit.Assert.*;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
public class VoiceInputControllerTest {
  @Test public void languagePrefixIsNotTranscription() {
    assertEquals("", VoiceInputController.clean("language Chinese<asr_"));
    assertEquals("", VoiceInputController.clean("language Chinese<asr_text>"));
    assertEquals("你好", VoiceInputController.clean("language Chinese<asr_text>你好<|im_end|>"));
  }
  @Test public void wavHeaderMatchesCapturedPcm() {
    byte[] pcm = new byte[32000];
    ByteBuffer wav = ByteBuffer.wrap(VoiceInputController.wave(pcm)).order(ByteOrder.LITTLE_ENDIAN);
    assertEquals(32044, wav.capacity()); assertEquals(32036, wav.getInt(4));
    assertEquals(16000, wav.getInt(24)); assertEquals(32000, wav.getInt(40));
    assertEquals(1, wav.getShort(22)); assertEquals(16, wav.getShort(34));
  }
}
