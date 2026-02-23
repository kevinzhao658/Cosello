# Grand Exchange

A neighborhood marketplace web app.

## Running the app

```bash
npm install
npm run dev
```

Access the site at: http://localhost:5173

## Tech Stack

- **React 18** + **TypeScript**
- **Tailwind CSS v4** (via Vite plugin)
- **Radix UI** primitives (dropdown, select)
- **Lucide React** icons
- **Vite 6** dev server and bundler

## File Structure

```
frontend/
├── index.html                    # HTML entry point
├── package.json                  # Dependencies and scripts
├── vite.config.ts                # Vite + Tailwind plugin config
├── postcss.config.mjs            # PostCSS config
└── src/
    ├── main.tsx                  # React entry — mounts <App />
    ├── App.tsx                   # Main app component (home page)
    ├── components/
    │   └── ui/
    │       ├── button.tsx        # Button component (shadcn/ui)
    │       ├── dropdown-menu.tsx # Dropdown menu component
    │       ├── image-with-fallback.tsx # Image with error fallback
    │       ├── input.tsx         # Input component
    │       ├── select.tsx        # Select component
    │       └── utils.ts          # cn() class merge utility
    └── styles/
        ├── index.css             # Root stylesheet (imports others)
        ├── fonts.css             # Google Fonts (Courier Prime)
        ├── tailwind.css          # Tailwind directives + custom animations
        └── theme.css             # CSS variables for colors, radii, typography
```
