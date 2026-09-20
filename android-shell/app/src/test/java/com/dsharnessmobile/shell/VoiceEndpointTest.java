package com.dsharnessmobile.shell;
import org.junit.Test;
import static org.junit.Assert.*;
public class VoiceEndpointTest {
  private void frames(VoiceEndpoint v, boolean speech, int ms) { for(int i=0;i<ms;i+=20) v.accept(speech,20); }
  @Test public void silenceStopsAtFiveSecondsWithoutSubmittingEmptyAudio() {
    VoiceEndpoint v=new VoiceEndpoint();frames(v,false,4980);assertFalse(v.finished());v.accept(false,20);
    assertTrue(v.finished());assertFalse(v.heardSpeech());
  }
  @Test public void resumedSpeechResetsEntireFiveSecondWindow() {
    VoiceEndpoint v=new VoiceEndpoint();frames(v,true,400);frames(v,false,4500);assertFalse(v.finished());
    frames(v,true,200);frames(v,false,4980);assertFalse(v.finished());v.accept(false,20);assertTrue(v.finished());assertTrue(v.heardSpeech());assertEquals(5100,v.lastVoiceMs());
  }
  @Test public void singleImpulseDoesNotEstablishSpeech() {
    VoiceEndpoint v=new VoiceEndpoint();v.accept(true,20);frames(v,false,4980);assertTrue(v.finished());assertFalse(v.heardSpeech());
  }
}
