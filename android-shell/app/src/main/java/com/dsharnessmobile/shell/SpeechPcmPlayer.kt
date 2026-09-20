package com.dsharnessmobile.shell

import android.media.*
import android.os.SystemClock
import android.util.Base64
import org.json.JSONObject

/** Single worker writes; cancellation may interrupt a blocked AudioTrack write. */
internal class SpeechPcmPlayer {
 @Volatile private var closed=false
 @Volatile private var track:AudioTrack?=null
 private var frames=0L
 private var rate=0
 fun accept(event:JSONObject){
  check(!closed){"朗读已取消"}
  when(event.getString("type")){
   "format"->{
    check(track==null&&event.getString("encoding")=="pcm16"&&event.getInt("channels")==1)
    rate=event.getInt("sampleRate");check(rate in listOf(16000,22050,24000,32000,44100,48000))
    val t=AudioTrack.Builder().setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
     .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(rate).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
     .setBufferSizeInBytes(maxOf(AudioTrack.getMinBufferSize(rate,AudioFormat.CHANNEL_OUT_MONO,AudioFormat.ENCODING_PCM_16BIT),rate/5*2)).setTransferMode(AudioTrack.MODE_STREAM).build()
    synchronized(this){if(closed){t.release();error("朗读已取消")};track=t;t.play()}
   }
   "audio"->{
    val t=checkNotNull(track);val pcm=Base64.decode(event.getString("audio"),Base64.DEFAULT);check(pcm.size%2==0)
    var offset=0
    while(offset<pcm.size){check(!closed);val n=t.write(pcm,offset,pcm.size-offset,AudioTrack.WRITE_BLOCKING);check(n>0){"音频播放失败"};offset+=n;frames+=n/2}
   }
   "done"->{
    val t=checkNotNull(track);val deadline=SystemClock.elapsedRealtime()+10_000
    while(!closed&&(t.playbackHeadPosition.toLong() and 0xffffffffL)<frames&&SystemClock.elapsedRealtime()<deadline)Thread.sleep(20)
   }
  }
 }
 @Synchronized fun close(){if(closed)return;closed=true;track?.let{runCatching{it.pause();it.flush();it.release()}};track=null}
}
