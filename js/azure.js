// Azure Speech SDK（CDN経由で読み込み済みのグローバル SpeechSDK を使用）で発音評価を行う
// マイクの生波形を自前で録音し、ユーザーが「終了」を押した時点でまとめて送信する方式
// （SDKの自動無音検出やcontinuous recognitionは安定性の問題があるため使用しない）

function mergeFloat32(chunks) {
  const length = chunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function downsample(buffer, fromRate, toRate) {
  if (toRate === fromRate) return buffer;
  const ratio = fromRate / toRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < newLength) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

function floatTo16BitPCM(input) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

export function startPronunciationSession(word, key, region, { onResult, onError }) {
  if (!window.SpeechSDK) {
    onError(new Error('Azure Speech SDKが読み込まれていません'));
    return { stop: () => {} };
  }

  let stopped = false;
  let mediaStream = null;
  let audioContext = null;
  let processor = null;
  let source = null;
  const chunks = [];

  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((streamObj) => {
      if (stopped) {
        streamObj.getTracks().forEach((t) => t.stop());
        return;
      }
      mediaStream = streamObj;
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      source = audioContext.createMediaStreamSource(mediaStream);
      processor = audioContext.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        if (stopped) return;
        chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(audioContext.destination);
    })
    .catch((err) => onError(new Error('マイクを使用できませんでした: ' + err.message)));

  function stop() {
    if (stopped) return;
    stopped = true;

    const nativeSampleRate = audioContext ? audioContext.sampleRate : 48000;
    if (processor) processor.disconnect();
    if (source) source.disconnect();
    if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
    if (audioContext) audioContext.close();

    if (chunks.length === 0) {
      onError(new Error('音声を認識できませんでした。もう一度発音してみてください'));
      return;
    }

    const merged = mergeFloat32(chunks);
    const resampled = downsample(merged, nativeSampleRate, 16000);
    const pcm16 = floatTo16BitPCM(resampled);

    const SDK = window.SpeechSDK;
    const pushStream = SDK.AudioInputStream.createPushStream(
      SDK.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1),
    );
    pushStream.write(pcm16.buffer);
    pushStream.close();

    const speechConfig = SDK.SpeechConfig.fromSubscription(key, region);
    speechConfig.speechRecognitionLanguage = 'en-US';
    const audioConfig = SDK.AudioConfig.fromStreamInput(pushStream);
    const pronunciationConfig = new SDK.PronunciationAssessmentConfig(
      word,
      SDK.PronunciationAssessmentGradingSystem.HundredMark,
      SDK.PronunciationAssessmentGranularity.Phoneme,
      true,
    );
    const recognizer = new SDK.SpeechRecognizer(speechConfig, audioConfig);
    pronunciationConfig.applyTo(recognizer);

    recognizer.recognizeOnceAsync(
      (result) => {
        recognizer.close();
        if (result.reason !== SDK.ResultReason.RecognizedSpeech) {
          onError(new Error('音声を認識できませんでした。もう一度発音してみてください'));
          return;
        }
        const assessment = SDK.PronunciationAssessmentResult.fromResult(result);
        onResult({ score: Math.round(assessment.accuracyScore), recognizedText: result.text });
      },
      (err) => {
        recognizer.close();
        onError(new Error(err));
      },
    );
  }

  return { stop };
}
