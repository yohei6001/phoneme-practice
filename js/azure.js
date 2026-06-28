// Azure Speech SDK（CDN経由で読み込み済みのグローバル SpeechSDK を使用）で発音評価を行う

export async function assessPronunciation(word, key, region) {
  if (!window.SpeechSDK) throw new Error('Azure Speech SDKが読み込まれていません');

  const speechConfig = window.SpeechSDK.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechRecognitionLanguage = 'en-US';
  // 単語1つだけの発音なので、発話終了の判定を早める（デフォルトは長めの無音待ちでテンポが悪くなる）
  speechConfig.setProperty(window.SpeechSDK.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, '300');
  speechConfig.setProperty(window.SpeechSDK.PropertyId.Speech_SegmentationSilenceTimeoutMs, '300');
  const audioConfig = window.SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();

  const pronunciationConfig = new window.SpeechSDK.PronunciationAssessmentConfig(
    word,
    window.SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
    window.SpeechSDK.PronunciationAssessmentGranularity.Phoneme,
    true,
  );

  const recognizer = new window.SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
  pronunciationConfig.applyTo(recognizer);

  return new Promise((resolve, reject) => {
    recognizer.recognizeOnceAsync(
      (result) => {
        recognizer.close();
        if (result.reason !== window.SpeechSDK.ResultReason.RecognizedSpeech) {
          reject(new Error('音声を認識できませんでした。もう一度発音してみてください'));
          return;
        }
        const assessment = window.SpeechSDK.PronunciationAssessmentResult.fromResult(result);
        resolve({
          score: Math.round(assessment.accuracyScore),
          recognizedText: result.text,
        });
      },
      (err) => {
        recognizer.close();
        reject(new Error(err));
      },
    );
  });
}
