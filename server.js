require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const PORT = process.env.PORT || 3000;

// 静的ファイル配信
app.use(express.static(path.join(__dirname, 'public')));

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// DeepL翻訳（APIキーを引数で受け取る）
async function translate(text, sourceLang, targetLang, deeplApiKey) {
  if (!text || !text.trim()) return '';
  if (!deeplApiKey) return text; // キー無しの場合は原文をそのまま返す

  // Free APIかPro APIかを判定
  const isFree = deeplApiKey.endsWith(':fx');
  const apiUrl = isFree
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${deeplApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: [text],
      source_lang: sourceLang,
      target_lang: targetLang,
    }),
  });

  if (!response.ok) {
    console.error('DeepL API error:', response.status, await response.text());
    return `[翻訳エラー] ${text}`;
  }

  const data = await response.json();
  return data.translations[0].text;
}

// WebSocket接続
wss.on('connection', (clientWs) => {
  console.log('Client connected');

  let deepgramWs = null;
  let sourceLang = 'en';
  let targetLang = 'JA';
  let deeplApiKey = '';

  clientWs.on('message', (message) => {
    // テキストメッセージ（設定など）
    if (typeof message === 'string' || (message instanceof Buffer && message[0] === 0x7b)) {
      try {
        const msg = JSON.parse(message.toString());

        if (msg.type === 'config') {
          sourceLang = msg.sourceLang || 'en';
          targetLang = msg.targetLang || 'JA';
          deeplApiKey = msg.deeplApiKey || process.env.DEEPL_API_KEY || '';
          console.log(`Config: ${sourceLang} → ${targetLang}, API key: ${deeplApiKey ? 'set' : 'none'}`);
          startDeepgram();
          return;
        }

        if (msg.type === 'stop') {
          if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
            deepgramWs.send(JSON.stringify({ type: 'CloseStream' }));
          }
          return;
        }
      } catch (e) {
        // バイナリ音声データとして処理
      }
    }

    // 音声データをDeepgramに転送
    if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
      deepgramWs.send(message);
    }
  });

  function startDeepgram() {
    if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
      deepgramWs.close();
    }

    const params = new URLSearchParams({
      model: 'nova-2',
      language: sourceLang,
      punctuate: 'true',
      interim_results: 'true',
      utterance_end_ms: '1000',
      smart_format: 'true',
      endpointing: '300',
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
    });

    const dgUrl = `wss://api.deepgram.com/v1/listen?${params}`;

    deepgramWs = new WebSocket(dgUrl, {
      headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` },
    });

    deepgramWs.on('open', () => {
      console.log('Deepgram connected');
      clientWs.send(JSON.stringify({ type: 'status', message: 'ready' }));
    });

    deepgramWs.on('message', async (data) => {
      try {
        const result = JSON.parse(data.toString());

        if (result.type === 'Results') {
          const alt = result.channel?.alternatives?.[0];
          if (!alt || !alt.transcript) return;

          const transcript = alt.transcript;

          if (result.is_final) {
            clientWs.send(JSON.stringify({
              type: 'final_transcript',
              transcript,
            }));

            try {
              const translated = await translate(transcript, sourceLang, targetLang, deeplApiKey);
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({
                  type: 'translation',
                  original: transcript,
                  translated,
                }));
              }
            } catch (err) {
              console.error('Translation error:', err);
              // 翻訳エラー時も原文を返す
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({
                  type: 'translation',
                  original: transcript,
                  translated: transcript,
                }));
              }
            }
          } else {
            clientWs.send(JSON.stringify({
              type: 'interim',
              transcript,
            }));
          }
        }
      } catch (err) {
        console.error('Deepgram message parse error:', err);
      }
    });

    deepgramWs.on('error', (err) => {
      console.error('Deepgram error:', err.message);
      clientWs.send(JSON.stringify({
        type: 'error',
        message: 'Deepgram接続エラー',
      }));
    });

    deepgramWs.on('close', () => {
      console.log('Deepgram disconnected');
    });
  }

  clientWs.on('close', () => {
    console.log('Client disconnected');
    if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
      deepgramWs.close();
    }
  });

  clientWs.on('error', (err) => {
    console.error('Client WebSocket error:', err.message);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
