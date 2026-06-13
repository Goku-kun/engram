# engram

Turn anything you read into memories that stick.

Upload a PDF, a photo of handwritten notes, or a plain text file. Claude reads it
and writes you a study pack: flashcards, a multiple-choice quiz, and a summary.
Engram grades your quiz attempts server-side and keeps a score history for every
deck.

## How it works

```mermaid
flowchart TD
    browser([browser])

    browser -->|"POST /uploads"| apigwA[API Gateway]
    apigwA --> upload["upload-url Lambda<br/>creates deck record,<br/>returns presigned S3 POST"]

    browser -->|"POST file"| s3[(S3)]
    s3 -->|"S3 event"| processor["processor Lambda<br/>calls Claude, writes<br/>cards, quiz, summary"]
    processor --> ddb[(DynamoDB)]
    processor -->|"embed summary + cards"| vec[(S3 Vectors)]

    browser -->|"GET /decks/{id} (poll until ready)"| apigwB[API Gateway]
    apigwB --> api[api Lambda]
    api --> ddb
```

One constraint shapes the whole design: Claude can take a minute or more to write
a study pack, but API Gateway cuts every request off at 30 seconds. So the upload
returns immediately, processing runs off an S3 event, and the frontend polls the
deck until its status flips to `ready`.

## Asking your notes (RAG)

`/ask` runs a retrieval pass over everything you've uploaded, then lets Claude
answer from your own notes.

```mermaid
flowchart TD
    browser([browser]) -->|"POST /ask"| apigw[API Gateway]
    apigw --> api[api Lambda]
    api -->|"embed question"| bedrock["Amazon Bedrock<br/>Titan Text Embeddings V2"]
    api -->|"top-8 cosine, scoped to user"| vec[(S3 Vectors)]
    api -->|"answer only from excerpts"| claude["Claude (claude-opus-4-8)"]
    api -->|"answer + source decks"| browser
```

Indexing happens while a deck is processed. The processor embeds each summary
paragraph and each card (`front` + `back`) with Amazon Titan Text Embeddings V2
(1024-dimensional) through Bedrock, and stores the vectors in an S3 Vectors index
named `cards`. Every vector is tagged with the owner's user id, the deck id and
title, and the source text.

A question takes the same path in reverse. The api Lambda embeds the question
with the same model, asks S3 Vectors for the eight nearest vectors by cosine
similarity, filtered to vectors tagged with the caller's user id, so you only
ever retrieve your own notes. Those excerpts go to Claude with a system prompt
that tells it to answer only from the notes and name the decks it drew on. The
response is the answer plus a deduplicated list of source decks; if nothing
matches, it tells you there are no notes on that yet.

## Repository layout

npm workspaces, TypeScript everywhere.

| Package               | What it is                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared`              | Types, Zod schemas, and DynamoDB key helpers. The single source of truth the other packages import.                                                        |
| `infra`               | AWS CDK app with three stacks: `EngramData` (DynamoDB, S3, Cognito, S3 Vectors), `EngramApi` (HTTP API + Lambdas), `EngramProcessing` (the Claude worker). |
| `services/upload-url` | Creates the deck record and a presigned S3 POST, capped at 20 MB.                                                                                          |
| `services/processor`  | S3-triggered. Fetches the Anthropic key from SSM, calls Claude (`claude-opus-4-8`), writes the results, and embeds the pack into the vector index.         |
| `services/api`        | Deck reads, server-side quiz grading, and `/ask` retrieval over your notes, behind a Cognito JWT authorizer.                                               |
| `web`                 | Next.js app: upload, flashcards, quiz, attempt history.                                                                                                    |

## API

| Route                           | Purpose                                                    |
| ------------------------------- | ---------------------------------------------------------- |
| `POST /uploads`                 | Create a deck record, get a presigned upload               |
| `GET /decks`                    | List your decks                                            |
| `GET /decks/{deckId}`           | Deck with cards and quiz (answers stay server-side)        |
| `POST /decks/{deckId}/attempts` | Submit answers, get a graded result                        |
| `GET /decks/{deckId}/attempts`  | Your attempt history                                       |
| `POST /ask`                     | Ask across your notes; returns an answer with source decks |

Every route sits behind a Cognito JWT authorizer.

## Running it yourself

You need Node 20+, an AWS account with CDK bootstrapped, and an Anthropic API key.

```bash
npm install

# the processor reads the API key from SSM at runtime
aws ssm put-parameter \
  --name /engram/anthropic-api-key \
  --type SecureString \
  --value sk-ant-your-key

# deploy all three stacks; CDK resolves the dependency order
cd infra
npm run cdk -- deploy --all
```

Embeddings run on Amazon Bedrock. The Lambdas reach it through IAM, which CDK
grants, but Bedrock model access is opt-in per account, so enable access to
`amazon.titan-embed-text-v2:0` in your region first. Claude still runs on the
Anthropic key you put in SSM above.

Point the web app at what you just deployed. In `web/.env.local`:

```bash
NEXT_PUBLIC_API_URL=             # your EngramApi endpoint
NEXT_PUBLIC_USER_POOL_ID=        # from EngramData
NEXT_PUBLIC_USER_POOL_CLIENT_ID= # from EngramData
```

Then:

```bash
cd web
npm run dev
```

Sign up, confirm the emailed code, and drop in something worth remembering.

## Development

```bash
npm run typecheck   # all workspaces
npm test            # all workspaces (shared has the schema tests)
```

The web app has its own `dev`, `build`, and `lint` scripts.

A few conventions the code holds to. Zod parses everything that crosses a
trust boundary, whether it came back from Claude or arrived in a request body.
DynamoDB uses a single-table design, and the key helpers in `shared` are the
only way any package touches it. Secrets stay in SSM Parameter Store and never
land in code or committed env files.

## License

MIT. See [LICENSE](LICENSE).
