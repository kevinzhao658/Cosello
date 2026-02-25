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

## How Sell Mode Works

1. Toggle to **Sell** and upload product photo(s)
2. Hit the submit arrow — images are sent to the backend
3. The backend sends images to **Claude Vision** which analyzes them
4. Product details (title, description, price, condition, location, venues) are auto-generated
5. The user can edit any field before posting the listing
