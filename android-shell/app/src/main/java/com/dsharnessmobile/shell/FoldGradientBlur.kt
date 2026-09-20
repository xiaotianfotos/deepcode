package com.dsharnessmobile.shell

import android.graphics.BlendMode
import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import android.view.View

/** Spatially varying Gaussian approximation from native, filtered blur levels.
 * Mixing adjacent scales avoids sparse-tap grids on small text at large sigma.
 * Every level samples the same live RenderNode; no fitted screenshot or tint.
 */
class FoldGradientBlur(private val density: Float) {
  private var implementation: Api33? = null
  var error: String? = null
    private set
  val supported get() = Build.VERSION.SDK_INT >= 33 && error == null
  val maxSigma get() = 14f * density

  fun warmUp() {
    if (supported && implementation == null) try { implementation = Api33(maxSigma) }
    catch (e: RuntimeException) { error = e.javaClass.simpleName }
  }
  fun apply(view: View, amount: Float) {
    if (Build.VERSION.SDK_INT < 31) return
    if (amount <= .001f || view.width <= 0 || view.height <= 0 || !supported) {
      view.setRenderEffect(null); return
    }
    warmUp()
    try { view.setRenderEffect(implementation?.effect(view.width, amount)) }
    catch (e: RuntimeException) { error = e.javaClass.simpleName; view.setRenderEffect(null) }
  }
  fun applyCoverProjection(view:View,angle:Float,visibleWidth:Int=view.width,visibleOffset:Float=0f) {
    if(Build.VERSION.SDK_INT<31)return
    if(!supported || view.width<=0 || angle<=FoldProjection.CLOSED_CLEAR_DEGREES){view.setRenderEffect(null);return}
    warmUp()
    val amount=FoldProjection.coverStrength(angle)
    try { view.setRenderEffect(implementation?.effect(visibleWidth,amount,FoldProjection.boundary(angle),offset=visibleOffset,height=view.height,tilt=FoldPerspective.tilt(angle,false),strength=FoldPerspective.strength(angle).toFloat()*amount)) }
    catch(e:RuntimeException){error=e.javaClass.simpleName;view.setRenderEffect(null)}
  }
  fun applyMovingInnerHalf(view:View,angle:Float){
    if(Build.VERSION.SDK_INT<31)return
    if(!supported || view.width<=0 || angle>=FoldProjection.OPEN_CLEAR_DEGREES){view.setRenderEffect(null);return}
    warmUp()
    val amount=FoldProjection.innerStrength(angle)
    try {view.setRenderEffect(implementation?.effect(view.width,amount,FoldProjection.innerBoundary(angle),true,height=view.height,tilt=FoldPerspective.tilt(angle,true),strength=FoldPerspective.strength(angle).toFloat()*amount))}
    catch(e:RuntimeException){error=e.javaClass.simpleName;view.setRenderEffect(null)}
  }
  private class Api33(maxSigma: Float) {
    private val levels = floatArrayOf(0f, .08f, .22f, .5f, 1f)
    private val masks = Array(levels.size) { RuntimeShader(SOURCE) }
    private val blurs = levels.map { if (it == 0f) null else
      RenderEffect.createBlurEffect(maxSigma*it, maxSigma*it, Shader.TileMode.CLAMP) }
    fun effect(width: Int, amount: Float, boundary:Float?=null,innerHalf:Boolean=false,offset:Float=0f,height:Int=1,tilt:Float=0f,strength:Float=0f): RenderEffect {
      var combined: RenderEffect? = null
      for (i in levels.indices) {
        val lower = if (i == 0) -levels[1] else levels[i-1]
        if (lower >= amount) break
        val upper = if (i == levels.lastIndex) 2f else levels[i+1]
        val mask = masks[i]
        mask.setFloatUniform("width", width.toFloat())
        mask.setFloatUniform("offset", offset)
        mask.setFloatUniform("height", height.toFloat())
        mask.setFloatUniform("tilt", tilt)
        mask.setFloatUniform("strength", strength)
        mask.setFloatUniform("amount", amount)
        mask.setFloatUniform("extent", FoldBlurProfile.extent(amount))
        mask.setFloatUniform("projected",if(boundary==null)0f else 1f)
        mask.setFloatUniform("boundary",boundary?:0f)
        mask.setFloatUniform("innerHalf",if(innerHalf)1f else 0f)
        mask.setFloatUniform("innerFeather",FoldProjection.INNER_FEATHER_BEFORE,FoldProjection.INNER_FEATHER_AFTER)
        mask.setFloatUniform("levels", lower, levels[i], upper)
        val masked = RenderEffect.createRuntimeShaderEffect(mask, "content")
        val level = blurs[i]?.let { RenderEffect.createChainEffect(masked, it) } ?: masked
        // Weights form a partition of unity: preserve premultiplied alpha and
        // luminance instead of source-over layering with halos/ghosted copies.
        combined = combined?.let { RenderEffect.createBlendModeEffect(it, level, BlendMode.PLUS) } ?: level
      }
      return requireNotNull(combined)
    }
  }
  companion object {
    private const val SOURCE = """
      uniform shader content;
      uniform float width;
      uniform float offset;
      uniform float height;
      uniform float tilt;
      uniform float strength;
      uniform float amount;
      uniform float extent;
      uniform float projected;
      uniform float boundary;
      uniform float innerHalf;
      uniform float2 innerFeather;
      uniform float3 levels;
      half4 main(float2 p) {
        float t = clamp(p.x / (width * extent), 0.0, 1.0);
        float sigma = amount * (1.0 - t*t*(3.0 - 2.0*t));
        if(projected>0.5){
          float feather=0.24;
          float span=max(0.0001,min(feather,1.0-boundary));
          sigma=amount*smoothstep(boundary,boundary+span,(p.x-offset)/width);
          if(innerHalf>0.5){
            sigma=amount*(1.0-smoothstep(boundary-innerFeather.x,boundary+innerFeather.y,p.x/width));
          }
        }
        float weight = clamp(min((sigma-levels.x)/(levels.y-levels.x),
                                 (levels.z-sigma)/(levels.z-levels.y)),0.0,1.0);
        if (weight <= 0.0) return half4(0.0);
        // Back-project physical display pixels into a fixed image plane.
        // The real panel already supplies foreshortening: keep its raster full.
        float2 samplePoint = p;
        if (projected > 0.5) {
          float x = (p.x-offset)/width;
          float hinge = innerHalf > 0.5 ? 0.5 : 0.0;
          // The inner right half is stationary. Only the moving half warps.
          if (innerHalf < 0.5 || x < hinge) {
            float aspect = width/max(height,1.0);
            // A physical panel is half of the inner canvas, all of the cover.
            float panelAspect = aspect*(innerHalf > 0.5 ? 0.5 : 1.0);
            float eye = 2.4*max(panelAspect,1.0);
            float depth = abs(x-hinge)*aspect*sin(tilt);
            float perspective = eye/(eye-depth);
            float sx = hinge+(x-hinge)*cos(tilt)*perspective;
            float y = p.y/height;
            float sy = 0.5+(y-0.5)*perspective;
            // Artistic compensation, bounded per physical panel. Full ray
            // projection severely stretched live text near edge-on.
            float maxX = innerHalf > 0.5 ? 0.0225 : 0.045;
            sx = x+clamp((sx-x)*strength,-maxX,maxX);
            sy = y+clamp((sy-y)*strength,-0.02,0.02);
            // No wrapping or repeated edge pixels outside the image plane.
            if (sx < 0.0 || sx > 1.0 || sy < 0.0 || sy > 1.0)
              return half4(0.0,0.0,0.0,half(weight));
            samplePoint = float2(offset+sx*width,sy*height);
          }
        }
        return content.eval(samplePoint) * half(weight);
      }
    """
  }
}
