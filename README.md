# Realtime Translate

リアルタイム音声翻訳アプリ。マイクに話しかけると、音声認識と翻訳がリアルタイムで表示されます。

## Features

- **リアルタイム音声認識** — Deepgram Nova-2 による高精度STT
- **リアルタイム翻訳** — DeepL API による自然な翻訳
- **7言語対応** — EN / JA / ZH / KO / ES / FR / DE
- **モバイル最適化** — iPhone Safari でネイティブアプリのように動作（PWA対応）
- **セルフホスト** — サーバーに秘密情報なし。APIキーはユーザーがブラウザで入力
- **パスワード保護** — 環境変数 `ACCESS_PASSWORD` で任意にアクセス制限

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

アプリ内の設定画面（初回アクセス時に自動表示）で2つのAPIキーを入力します。

#### Deepgram（音声認識）

1. [console.deepgram.com](https://console.deepgram.com/signup) でアカウント作成
2. Dashboard → API Keys → Create a New API Key
3. キーをコピー

#### DeepL（翻訳）

1. [deepl.com/ja/pro-api](https://www.deepl.com/ja/pro-api) にアクセス
2. 無料アカウントを作成（Free プランで月50万文字まで無料）
3. アカウント設定ページでAPIキーをコピー

> APIキーはブラウザの localStorage に保存されます。サーバーには保存されません。

### 2. ローカルで動かす

```bash
git clone https://github.com/cdai2508-debug/realtime-translate.git
cd realtime-translate
npm install
cp .env.example .env
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
4. （任意）環境変数 `ACCESS_PASSWORD` を設定してアクセス制限
5. デプロイ完了。Railway が自動でURLを発行します

### 環境変数

| Variable | Required | Description |
|----------|----------|-------------|
| `ACCESS_PASSWORD` | No | 設定するとパスワード認証が有効になる |
| `PORT` | No | サーバーのポート番号（デフォルト: 3000） |

> `DEEPGRAM_API_KEY` と `DEEPL_API_KEY` はサーバー側では不要です。ユーザーがアプリの設定画面から入力します。

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
