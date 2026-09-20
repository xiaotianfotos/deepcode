set -eu
mkdir -p /root/dsh-build
cat > /root/dsh-build/native_probe.c <<'C'
#include <Python.h>
static PyObject *answer(PyObject *self, PyObject *args) { return PyLong_FromLong(42); }
static PyMethodDef methods[] = {{"answer", answer, METH_NOARGS, "Return test result"}, {NULL, NULL, 0, NULL}};
static struct PyModuleDef module = {PyModuleDef_HEAD_INIT, "native_probe", NULL, -1, methods};
PyMODINIT_FUNC PyInit_native_probe(void) { return PyModule_Create(&module); }
C
gcc -shared -fPIC $(python3-config --includes) /root/dsh-build/native_probe.c -o /root/dsh-build/native_probe$(python3-config --extension-suffix)
PYTHONPATH=/root/dsh-build python3 -c 'import native_probe,json; assert native_probe.answer()==42; print(json.dumps({"native_extension":native_probe.answer()}))' > /workspace/debian-native.json
node -e 'const fs=require("fs");fs.writeFileSync("/workspace/debian-node.json",JSON.stringify({platform:process.platform,arch:process.arch,result:6*7}))'
ffmpeg -hide_banner -loglevel error -f lavfi -i testsrc2=size=320x240:rate=10 -t 1 -c:v libx264 -pix_fmt yuv420p -y /workspace/debian-media-test.mp4
ffprobe -v error -show_entries stream=codec_name,width,height,nb_frames -show_entries format=duration -of json /workspace/debian-media-test.mp4 > /workspace/debian-media-report.json
python3 -m venv /root/dsh-build/venv
/root/dsh-build/venv/bin/python -m pip --version
python3 -c 'import json; d=json.load(open("/workspace/debian-media-report.json")); assert d["streams"][0]["nb_frames"]=="10"; assert float(d["format"]["duration"])==1; print("FUNCTIONAL_OK")'

dpkg-query -W -f='${Package} ${Version}\n' libc6 ffmpeg python3 nodejs gcc npm > /workspace/debian-package-versions.txt
