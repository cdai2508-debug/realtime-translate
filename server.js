const path = require('path');
const fs = require('fs');

// .envファイルが存在する場合のみdotenvを読み込む（Railway等では不要）
if (fs.existsSync(path.join(__dirname, '.env'))) {
  require('dotenv').config();
}

const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || '';

console.log(`Server starting on port ${PORT}`);
console.log(`Access password: ${ACCESS_PASSWORD ? 'set' : 'not set (open access)'}`);

const app = express();
app.use(express.json());
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 静的ファイル配信
app.use(express.static(path.join(__dirname, 'public')));

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 認証が必要かどうかを返す
app.get('/api/auth/required', (req, res) => {
  res.json({ required: !!ACCESS_PASSWORD });
});

// 認証エンドポイント
app.post('/api/auth', (req, res) => {
  if (!ACCESS_PASSWORD) {
    return res.json({ ok: true });
  }
  const { password } = req.body;
  if (password === ACCESS_PASSWORD) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false, message: 'パスワードが正しくありません' });
  }
});

// DeepL言語コード変換（Deepgramは小文字、DeepLは大文字 + 特殊ケース）
function toDeepLSourceLang(lang) {
  const upper = lang.toUpperCase();
  // DeepLのsource_langではZHはそのまま使える
  return upper;
}

function toDeepLTargetLang(lang) {
  const upper = lang.toUpperCase();
  // DeepLのtarget_langではEN→EN-US、PT→PT-BRなど特殊ケースあり
  if (upper === 'EN') return 'EN-US';
  return upper;
}

// DeepL翻訳（APIキーを引数で受け取る）
async function translate(text, sourceLang, targetLang, deeplApiKey) {
  if (!text || !text.trim()) return '';
  if (!deeplApiKey) {
    console.log('DeepL: no API key, returning original text');
    return text;
  }

  const isFree = deeplApiKey.endsWith(':fx');
  const apiUrl = isFree
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';

  const dlSourceLang = toDeepLSourceLang(sourceLang);
  const dlTargetLang = toDeepLTargetLang(targetLang);

  console.log(`DeepL: "${text}" | ${dlSourceLang} → ${dlTargetLang} | ${isFree ? 'Free' : 'Pro'} API | key: ${deeplApiKey.slice(0, 8)}...`);

  const body = {
    text: [text],
    source_lang: dlSourceLang,
    target_lang: dlTargetLang,
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${deeplApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`DeepL API error: ${response.status} ${response.statusText}`);
    console.error(`DeepL API response: ${errorBody}`);
    console.error(`DeepL API request: ${JSON.stringify(body)}`);
    return `[翻訳エラー] ${text}`;
  }

  const data = await response.json();
  console.log(`DeepL: translated → "${data.translations[0].text}"`);
  return data.translations[0].text;
}

// WebSocket接続
wss.on('connection', (clientWs) => {
  console.log('Client connected');

  let deepgramWs = null;
  let sourceLang = 'en';
  let targetLang = 'JA';
  let deeplApiKey = '';
  let deepgramApiKey = '';
  let authenticated = !ACCESS_PASSWORD;

  clientWs.on('message', (message) => {
    if (typeof message === 'string' || (message instanceof Buffer && message[0] === 0x7b)) {
      try {
        const msg = JSON.parse(message.toString());

        if (msg.type === 'config') {
          // パスワード検証
          if (ACCESS_PASSWORD && msg.password !== ACCESS_PASSWORD) {
            clientWs.send(JSON.stringify({ type: 'error', message: '認証エラー' }));
            clientWs.close();
            return;
          }
          authenticated = true;

          sourceLang = msg.sourceLang || 'en';
          targetLang = msg.targetLang || 'JA';
          deeplApiKey = msg.deeplApiKey || '';
          deepgramApiKey = msg.deepgramApiKey || '';

          if (!deepgramApiKey) {
            clientWs.send(JSON.stringify({ type: 'error', message: 'Deepgram APIキーが設定されていません' }));
            return;
          }

          console.log(`Config: ${sourceLang} → ${targetLang} | Deepgram key: ${deepgramApiKey ? deepgramApiKey.slice(0, 8) + '...' : 'NONE'} | DeepL key: ${deeplApiKey ? deeplApiKey.slice(0, 8) + '...' : 'NONE'}`);
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

    // 音声データをDeepgramに転送（認証済みの場合のみ）
    if (authenticated && deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
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
      headers: { Authorization: `Token ${deepgramApiKey}` },
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
        message: 'Deepgram接続エラー: APIキーを確認してください',
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
