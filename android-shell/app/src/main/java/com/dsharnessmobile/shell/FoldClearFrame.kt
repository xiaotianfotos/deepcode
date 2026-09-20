package com.dsharnessmobile.shell

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.HardwareRenderer
import android.graphics.PixelFormat
import android.graphics.RenderNode
import android.hardware.HardwareBuffer
import android.media.ImageReader
import android.webkit.WebView

/** A clear hardware recording of the same WebView, outside its window's effect.
 * Unlike software View.draw, the recording canvas supports Chromium GPU layers.
 * Never reparents/reloads the WebView. Buffers are consumed on every draw. */
class FoldClearFrame:AutoCloseable {
  private var reader:ImageReader?=null
  private var renderer:HardwareRenderer?=null
  private var node:RenderNode?=null
  private var width=0
  private var height=0
  fun draw(web:WebView):Bitmap? {
    val w=web.width;val h=web.height
    if(w<=0 || h<=0)return null
    if(w!=width || h!=height || reader==null){
      close();width=w;height=h
      reader=ImageReader.newInstance(w,h,PixelFormat.RGBA_8888,3,
        HardwareBuffer.USAGE_GPU_SAMPLED_IMAGE or HardwareBuffer.USAGE_GPU_COLOR_OUTPUT)
      node=RenderNode("DeepCode clear frame").apply { setPosition(0,0,w,h) }
      renderer=HardwareRenderer().apply {setSurface(reader!!.surface);setContentRoot(node);isOpaque=true}
    }
    val canvas=node!!.beginRecording(w,h)
    try {canvas.drawColor(Color.BLACK);web.draw(canvas)} finally {node!!.endRecording()}
    renderer!!.createRenderRequest().setWaitForPresent(true).syncAndDraw()
    val frame=reader!!.acquireLatestImage() ?: return null
    return frame.use {
      val buffer=it.hardwareBuffer ?: return null
      buffer.use { hardware ->
        val bitmap=Bitmap.wrapHardwareBuffer(hardware,null) ?: return null
        // Own a stable copy before the ImageReader returns this buffer to its
        // producer. The two physical consumers must not race buffer reuse.
        try {bitmap.copy(Bitmap.Config.ARGB_8888,false)} finally {bitmap.recycle()}
      }
    }
  }
  override fun close(){renderer?.destroy();renderer=null;node?.discardDisplayList();node=null;reader?.close();reader=null;width=0;height=0}
}
