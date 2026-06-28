// Azure Speech SDK（CDN経由で読み込み済みのグローバル SpeechSDK を使用）で発音評価を行う
// 自動の無音検出に頼らず、ユーザーが「終了」ボタンを押した時点で発音を確定させる方式

export function startPronunciationSession(word, key, region, { onResult, onError }) {
  if (!window.SpeechSDK) {
    onError(new Error('Azure Speech SDKが読み込まれていません'));
    return { stop: () => {} };
  }

  const SDK = window.SpeechSDK;
  const speechConfig = SDK.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechRecognitionLanguage = 'en-US';
  // 自動で無音判定して切る時間を長めにし、基本的には手動の「終了」操作で確定させる
  speechConfig.setProperty(SDK.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, '8000');
  speechConfig.setProperty(SDK.PropertyId.Speech_SegmentationSilenceTimeoutMs, '8000');

  const audioConfig = SDK.AudioConfig.fromDefaultMicrophoneInput();
  const pronunciationConfig = new SDK.PronunciationAssessmentConfig(
    word,
    SDK.PronunciationAssessmentGradingSystem.HundredMark,
    SDK.PronunciationAssessmentGranularity.Phoneme,
    true,
  );

  const recognizer = new SDK.SpeechRecognizer(speechConfig, audioConfig);
  pronunciationConfig.applyTo(recognizer);

  let settled = false;
  const finish = (fn) => {
    if (settled) return;
    settled = true;
    fn();
  };

  recognizer.recognized = (_sender, event) => {
    if (event.result.reason !== SDK.ResultReason.RecognizedSpeech) return;
    finish(() => {
      const assessment = SDK.PronunciationAssessmentResult.fromResult(event.result);
      onResult({ score: Math.round(assessment.accuracyScore), recognizedText: event.result.text });
    });
  };

  recognizer.canceled = (_sender, event) => {
    finish(() => onError(new Error(event.errorDetails || '認識に失敗しました')));
  };

  recognizer.startContinuousRecognitionAsync(
    () => {},
    (err) => finish(() => onError(new Error(err))),
  );

  return {
    stop: () => {
      recognizer.stopContinuousRecognitionAsync(
        () => {
          // 終了処理の中で末尾の音声分のrecognizedイベントが発火するのを少し待つ
          setTimeout(() => {
            finish(() => onError(new Error('音声を認識できませんでした。もう一度発音してみてください')));
            recognizer.close();
          }, 1500);
        },
        () => recognizer.close(),
      );
    },
  };
}
