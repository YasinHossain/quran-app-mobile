// Imported only by build-idle-isolate.py profile. Never part of a normal build.
const { NativeModules } = require('react-native');
setTimeout(() => {
  try {
    console.log('IDLE_HEAP_SNAPSHOT', NativeModules.IdleHeapDiagnostic.capture());
  } catch (error) {
    console.error('IDLE_HEAP_SNAPSHOT_FAILED', String(error));
  }
}, 45000);
