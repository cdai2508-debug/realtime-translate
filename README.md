# Realtime Translate

リアルタイム音声翻訳アプリ。マイクに話しかけると、音声認識と翻訳がリアルタイムで表示されます。

## Features

- **リアルタイム音声認識** — Deepgram Nova-2 による高精度STT
- **リアルタイム翻訳** — DeepL API による自然な翻訳
- **7言語対応** — EN / JA / ZH / KO / ES / FR / DE
- **モバイル最適化** — iPhone Safari でネイティブアプリのように動作（PWA対応）
- **APIキー不要でも使える** — DeepL APIキー未設定時は原文のみ表示

## How It Works

```
マイク → Deepgram (音声→テキスト) → DeepL (翻訳) → 画面に表示
```

1. ブラウザのマイクで音声を取得
2. WebSocket経由でサーバーにストリーミング
3. サーバーがDeepgramでリアルタイム文字起こし
4. 確定テキストをDeepLで翻訳
5. 翻訳結果をブラウザに返して表示

## Setup

### 1. APIキーの取得

#### Deepgram（音声認識 — 必須）

1. [deepgram.com](https://deepgram.com) でアカウント作成
2. Dashboard → API Keys → Create Key
3. キーをコピー

#### DeepL（翻訳 — 任意）

DeepLのAPIキーはアプリ内の設定画面から入力します。サーバー側の設定は不要です。

1. [deepl.com/ja/pro-api](https://www.deepl.com/ja/pro-api) にアクセス
2. 無料アカウントを作成（Free プランで月50万文字まで無料）
3. アカウント設定ページでAPIキーをコピー
4. アプリの設定画面（⚙）に貼り付け

> APIキー未設定でも音声認識は利用できます。翻訳なしで原文がそのまま表示されます。

### 2. ローカルで動かす

```bash
git clone https://github.com/cdai2508-debug/realtime-translate.git
cd realtime-translate
npm install
```

`.env` ファイルを作成:

```bash
cp .env.example .env
```

`.env` を編集して Deepgram API キーを設定:

```
DEEPGRAM_API_KEY=your_deepgram_api_key_here
PORT=3000
```

起動:

```bash
npm start
```

ブラウザで http://localhost:3000 を開く。

### 3. iPhoneで使う

ローカルネットワーク内でiPhoneからアクセスする場合:

1. Mac のIPアドレスを確認（`ifconfig | grep 192`）
2. iPhoneのSafariで `http://192.168.x.x:3000` にアクセス
3. 共有ボタン → 「ホーム画面に追加」でPWAとしてインストール

> **Note:** マイクを使うにはHTTPSが必要です。localhost以外からアクセスする場合は、`ngrok http 3000` などでHTTPSトンネルを作るか、デプロイしてください。

## Deploy to Railway

Railway なら数クリックでデプロイできます。

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/4bQJqd)

### 手動デプロイ

1. [Railway](https://railway.app) にログイン
2. 「New Project」→「Deploy from GitHub repo」
3. このリポジトリを選択
4. 環境変数を設定:
   - `DEEPGRAM_API_KEY` = あなたのDeepgramキー
5. デプロイ完了。Railway が自動でURLを発行します

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Vanilla HTML/CSS/JS (Single Page) |
| Backend | Node.js + Express |
| Realtime | WebSocket (ws) |
| STT | Deepgram Nova-2 |
| Translation | DeepL API |
| PWA | Web App Manifest |

## Architecture

```
┌─────────────┐     WebSocket      ┌──────────────┐     WebSocket     ┌──────────┐
│   Browser   │ ◄──────────────► │  Node.js     │ ◄────────────► │ Deepgram │
│  (PWA)      │   audio/results   │  Server      │   audio/STT      │ Nova-2   │
└─────────────┘                    └──────┬───────┘                    └──────────┘
                                          │ REST API
                                          ▼
                                   ┌──────────────┐
                                   │   DeepL API  │
                                   └──────────────┘
```

## License

MIT
