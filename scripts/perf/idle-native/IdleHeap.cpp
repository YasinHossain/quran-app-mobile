#include <jni.h>
#include <jsi/jsi.h>
#include <jsi/instrumentation.h>
#include <fstream>

// Linked only into the temporary profile diagnostic. Called synchronously on JS.
extern "C" JNIEXPORT void JNICALL
Java_com_anonymous_quranappmobile_perfidle_IdleHeapModule_captureNative(
    JNIEnv *env, jobject, jlong pointer, jstring filePath) {
  const char *chars = env->GetStringUTFChars(filePath, nullptr);
  const std::string path(chars);
  env->ReleaseStringUTFChars(filePath, chars);
  try {
    auto &runtime = *reinterpret_cast<facebook::jsi::Runtime *>(pointer);
    auto &instrumentation = runtime.instrumentation();
    auto writeInfo = [&](const std::string &suffix) {
      std::ofstream file(path + suffix);
      for (const auto &[key, value] : instrumentation.getHeapInfo(true)) {
        file << key << "=" << value << "\n";
      }
    };
    writeInfo(".before.txt");
    instrumentation.createSnapshotToFile(path);
    writeInfo(".after.txt");
  } catch (const std::exception &error) {
    env->ThrowNew(env->FindClass("java/lang/RuntimeException"), error.what());
  }
}
