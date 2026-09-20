#include <jni.h>
#include <stdint.h>
#include "fvad.h"

JNIEXPORT jlong JNICALL Java_com_dsharnessmobile_shell_NativeVoiceVad_create(JNIEnv *env, jclass cls) {
    Fvad *vad = fvad_new();
    if (!vad) return 0;
    if (fvad_set_sample_rate(vad, 16000) || fvad_set_mode(vad, 2)) { fvad_free(vad); return 0; }
    return (jlong)(intptr_t)vad;
}
JNIEXPORT jint JNICALL Java_com_dsharnessmobile_shell_NativeVoiceVad_process(JNIEnv *env, jclass cls, jlong ptr, jbyteArray pcm) {
    if (!ptr || !pcm || (*env)->GetArrayLength(env, pcm) != 640) return -1;
    int16_t samples[320];
    (*env)->GetByteArrayRegion(env, pcm, 0, 640, (jbyte*)samples);
    if ((*env)->ExceptionCheck(env)) return -1;
    return fvad_process((Fvad*)(intptr_t)ptr, samples, 320);
}
JNIEXPORT void JNICALL Java_com_dsharnessmobile_shell_NativeVoiceVad_destroy(JNIEnv *env, jclass cls, jlong ptr) {
    if (ptr) fvad_free((Fvad*)(intptr_t)ptr);
}
