import sys, json, sherpa_onnx, soundfile as sf
modelo, entrada, salida = sys.argv[1], sys.argv[2], sys.argv[3]
import glob
onnx = glob.glob(f'modelos/{modelo}/*.onnx')[0]
cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
    vits=sherpa_onnx.OfflineTtsVitsModelConfig(model=onnx, tokens=f'modelos/{modelo}/tokens.txt', data_dir=f'modelos/{modelo}/espeak-ng-data', length_scale=1.08),
    num_threads=4))
tts = sherpa_onnx.OfflineTts(cfg)
frases = json.load(open(entrada))
dur = []
for i, t in enumerate(frases):
    a = tts.generate(t, sid=0, speed=1.0)
    sf.write(f'{salida}/b{i:02d}.wav', __import__('numpy').asarray(a.samples, dtype='float32'), int(a.sample_rate), subtype='PCM_16')
    dur.append(len(a.samples) / a.sample_rate)
json.dump(dur, open(f'{salida}/dur.json', 'w'))
print(len(frases), 'frases', round(sum(dur)), 's', a.sample_rate, 'Hz')
