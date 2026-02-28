# Grand Exchange

A neighborhood marketplace web app with AI-powered product listing.

## Running the App

### 1. Backend (Python / FastAPI)

```bash
cd backend
pip install -r requirements.txt
export ANTHROPIC_API_KEY="your-key-here"
uvicorn main:app --reload
```

The API runs at: http://localhost:8000

### 2. Frontend (React / Vite)

```bash
cd frontend
npm install
npm run dev
```

Access the site at: http://localhost:5173

> The frontend proxies `/api` requests to the backend automatically.

## Tech Stack

### Frontend
- **React 18** + **TypeScript**
- **Tailwind CSS v4** (via Vite plugin)
- **Radix UI** primitives (dropdown, select)
- **Lucide React** icons
- **Vite 6** dev server and bundler

### Backend
- **FastAPI** + **Uvicorn**
- **SQLAlchemy** + **SQLite** (user database)
- **PyJWT** (authentication tokens)
- **Anthropic SDK** (Claude Vision API)
- **Pillow** (image resizing for large uploads)

## File Structure

```
Grand-Exchange/
├── backend/
│   ├── main.py               # FastAPI app — /api/generate-listing endpoint
│   └── requirements.txt      # Python dependencies
│
└── frontend/
    ├── index.html             # HTML entry point
    ├── package.json           # Dependencies and scripts
    ├── vite.config.ts         # Vite + Tailwind + API proxy config
    ├── postcss.config.mjs     # PostCSS config
    └── src/
        ├── main.tsx           # React entry — mounts <App />
        ├── App.tsx            # Main app component (home page + sell flow)
        ├── components/
        │   └── ui/
        │       ├── button.tsx         # Button component (shadcn/ui)
        │       ├── dropdown-menu.tsx  # Dropdown menu component
        │       ├── image-with-fallback.tsx # Image with error fallback
        │       ├── input.tsx          # Input component
        │       ├── select.tsx         # Select component
        │       └── utils.ts           # cn() class merge utility
        └── styles/
            ├── index.css      # Root stylesheet (imports others)
            ├── fonts.css      # Google Fonts (Courier Prime)
            ├── tailwind.css   # Tailwind directives + custom animations
            └── theme.css      # CSS variables for colors, radii, typography
```

## Authentication

Phone-based OTP authentication. Currently uses a **mock OTP** that prints the code to the backend console (no SMS sent).

### Upgrade Options for Production SMS

| Provider | Free Tier | Cost | Notes |
|----------|-----------|------|-------|
| **Firebase Auth** | 10,000 verifications/month | Free (Spark plan) | Google-managed, easiest free option |
| **Supabase Auth** | Included in free tier | Free | Open-source, self-hostable |
| **Twilio Verify** | ~$15 trial credits | ~$0.05/verification | Industry standard, most reliable |
| **Twilio SMS** | ~$15 trial credits | ~$0.008/message + $1.15/mo for number | DIY OTP over raw SMS |
| **AWS SNS** | 100 free SMS/month | ~$0.01/message after | Good if already on AWS |

To upgrade, replace the `send_otp()` function in `backend/auth.py` with the chosen provider's SDK call. The rest of the auth flow (OTP storage, verification, JWT issuance) remains unchanged.

## How Sell Mode Works

1. Toggle to **Sell** and upload product photo(s)
2. Hit the submit arrow — images are sent to the backend
3. The backend sends images to **Claude Vision** which analyzes them
4. Product details (title, description, price, condition, location, venues) are auto-generated
5. The user can edit any field before posting the listing
