# ChatVault AI

> WhatsApp-native memory layer — captures conversations, parses attachments, enables semantic search & summarization via RAG.
>
> ## Architecture
>
> ```
> WhatsApp Cloud API ──> Vercel/Next.js Webhook ──> Supabase (Postgres + pgvector)
>                                                        │
>                                           ┌─────────────┼─────────────┐
>                                           ▼             ▼             ▼
>                                     Backblaze B2   OpenRouter     Tesseract
>                                   (file storage)  (LLM + embed)  (OCR)
>                                           │             │             │
>                                           └─────────────┼─────────────┘
>                                                         ▼
>                                               Web Dashboard + WhatsApp Bot
> ```
>
> ## Tech Stack
>
> | Layer | Technology |
> |---|---|
> | Frontend | Next.js 14 + Tailwind CSS |
> | Backend/API | Next.js API Routes (Vercel) |
> | Database | Supabase (Postgres + pgvector) |
> | Auth | Supabase Auth |
> | Storage | Backblaze B2 (S3-compatible) |
> | LLM | OpenRouter (Qwen, DeepSeek, GPT) |
> | Embeddings | OpenAI text-embedding-3-small |
> | OCR | Tesseract.js + Google Cloud Vision |
> | PDF Parsing | pdf-parse |
> | Speech-to-Text | OpenAI Whisper |
> | Messaging | WhatsApp Cloud API |
>
> ## Project Structure
>
> ```
> chatvault-ai/
> ├── src/
> │   ├── app/
> │   │   ├── api/
> │   │   │   ├── webhook/whatsapp/route.ts   # WhatsApp webhook handler
> │   │   │   ├── search/route.ts             # RAG search API
> │   │   │   └── summarize/route.ts          # Summary generation API
> │   │   ├── dashboard/page.tsx              # Main dashboard
> │   │   ├── login/page.tsx                  # Auth page
> │   │   ├── layout.tsx                      # Root layout
> │   │   └── globals.css                     # Tailwind imports
> │   ├── lib/
> │   │   ├── supabase.ts                     # Supabase client + types
> │   │   ├── whatsapp.ts                     # WhatsApp Cloud API client
> │   │   ├── storage.ts                      # Backblaze B2 storage
> │   │   ├── embeddings.ts                   # Chunking + vector embeddings
> │   │   └── rag.ts                          # RAG engine + summarization
> │   └── workers/
> │       ├── attachment-processor.ts          # OCR, PDF, audio processing
> │       └── chat-importer.ts                # WhatsApp export file parser
> ├── supabase/
> │   └── migrations/
> │       └── 001_initial_schema.sql          # Full database schema
> ├── package.json
> ├── tsconfig.json
> ├── tailwind.config.ts
> └── .env.example
> ```
>
> ## Quick Start
>
> 1. Clone and install:
> 2. ```bash
>    git clone https://github.com/visheshkhurana/chatvault-ai.git
>    cd chatvault-ai
>    npm install
>    ```
>
> 2. Set up environment:
> 3. ```bash
>    cp .env.example .env.local
>    # Fill in all required values
>    ```
>
> 3. Set up Supabase:
> 4.    - Create a new project at supabase.com
>       -    - Run the migration in `supabase/migrations/001_initial_schema.sql`
>            -    - Enable the `vector` extension in SQL editor
>             
>                 - 4. Set up WhatsApp:
>                   5.    - Create a Meta Business account
>                         -    - Register a WhatsApp Business number
>                              -    - Configure webhook URL to `your-domain.vercel.app/api/webhook/whatsapp`
>                               
>                                   - 5. Run locally:
>                                     6. ```bash
>                                        npm run dev                    # Start Next.js dashboard
>                                        npm run process:attachments    # Start attachment worker (separate terminal)
>                                        ```
>
> 6. Deploy:
> 7. ```bash
>    vercel deploy
>    ```
>
> ## WhatsApp Bot Commands
>
> | Command | Description |
> |---|---|
> | `help` | Show available commands |
> | `find [query]` | Semantic search across messages |
> | `summary last N days` | Generate a chat summary |
> | `show documents about [topic]` | Find related attachments |
>
> ## Key Features
>
> - **Real-time message ingestion** via WhatsApp Cloud API webhook
> - - **Media processing**: OCR for images, PDF text extraction, voice note transcription
>   - - **Semantic search** with pgvector (hybrid vector + full-text)
>     - - **RAG-powered answers** with citations and source references
>       - - **Chat summaries** with action items and key topics
>         - - **Historical import** from WhatsApp's "Export Chat" .txt files
>           - - **Web dashboard** with search, chat browser, attachments gallery
>             - - **Row-level security** ensuring users only see their own data
>               - - **Data retention controls** with auto-cleanup
>                
>                 - ## License
>                
>                 - Private repository. All rights reserved.
