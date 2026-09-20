package com.dsharnessmobile.shell;

import org.junit.Test;
import static org.junit.Assert.*;

public class VoiceActivityGateTest {
  private void feed(VoiceActivityGate gate, VoiceEndpoint clock, double rms, boolean vad, int ms) {
    for (int i=0; i<ms; i+=20) clock.accept(gate.accept(vad,rms),20);
  }

  @Test public void quietSpeechAndSoftTailResetSilenceClock() {
    VoiceActivityGate gate=new VoiceActivityGate();VoiceEndpoint clock=new VoiceEndpoint();
    feed(gate,clock,.0001,false,500);
    feed(gate,clock,.02,true,300);
    for(int i=0;i<20;i++) {
      feed(gate,clock,.0001,false,200);
      feed(gate,clock,.002,true,300); // Well below the former .012 gate.
      assertFalse(clock.finished());
    }
    assertTrue(clock.heardSpeech());assertEquals(10800,clock.lastVoiceMs());
    feed(gate,clock,.0001,false,4980);assertFalse(clock.finished());
    feed(gate,clock,.0001,false,20);assertTrue(clock.finished());
  }

  @Test public void steadyNoiseDoesNotResetClockEvenWithVadHangover() {
    VoiceActivityGate gate=new VoiceActivityGate();VoiceEndpoint clock=new VoiceEndpoint();
    feed(gate,clock,.001,true,5000);
    assertTrue(clock.finished());assertFalse(clock.heardSpeech());
  }

  @Test public void noiseAfterSpeechSettlesWithoutHoldingRecordingOpen() {
    VoiceActivityGate gate=new VoiceActivityGate();VoiceEndpoint clock=new VoiceEndpoint();
    feed(gate,clock,.0001,false,500);feed(gate,clock,.03,true,500);
    feed(gate,clock,.002,true,8000);
    assertTrue(clock.finished());assertTrue(clock.lastVoiceMs()<=3000);
  }

  @Test public void energyAloneCannotPassTheSpeechClassifier() {
    VoiceActivityGate gate=new VoiceActivityGate();VoiceEndpoint clock=new VoiceEndpoint();
    feed(gate,clock,.05,false,5000);
    assertTrue(clock.finished());assertFalse(clock.heardSpeech());
  }

  @Test public void briefImpulseStillCannotEstablishSpeech() {
    VoiceActivityGate gate=new VoiceActivityGate();VoiceEndpoint clock=new VoiceEndpoint();
    feed(gate,clock,0,false,200);feed(gate,clock,.5,true,20);feed(gate,clock,0,false,4780);
    assertTrue(clock.finished());assertFalse(clock.heardSpeech());
  }
}
