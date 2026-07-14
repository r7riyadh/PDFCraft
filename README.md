# PDFCraft 🛠️

**PDFCraft** is a modern, high-performance, 100% client-side web application to merge and compress PDF files securely in your browser. Your files never leave your device, ensuring complete privacy.

## Features

- **WASM-Powered PDF Compression:** Integrates a WebAssembly build of MuPDF to optimize pages, strip metadata, and downscale images entirely offline.
- **Client-Side PDF Merging:** Sequentially copies pages from multiple input documents using `pdf-lib` into a unified PDF document.
- **Proportional Resolution Scaling:** Normalizes page dimensions to match the first document without stretching or squishing contents (maintaining original aspect ratios).
- **Custom Quality Presets:** Pick from **Medium** (Standard Size), **High** (Recommended), or **Best** (Maximum Quality) compression profiles.
- **Drag-and-Drop Sorting:** Easy visual file listing with the ability to drag and reorder files before processing.
- **100% Private:** No file data is sent to a server. No network requests are made with your documents.

## Technology Stack

- **Core:** TypeScript, HTML5, Vanilla CSS
- **Framework & Bundler:** Vite
- **Libraries:** `mupdf` (WebAssembly port), `pdf-lib`

## Getting Started

### Prerequisites

You need [Node.js](https://nodejs.org/) installed on your computer.

### Installation

1. Clone the repository or download the files.
2. Install the dependencies:
   ```bash
   npm install
   ```

### Running Locally

To start the development server:
```bash
npm run dev
```

To build and preview the production build locally:
```bash
npm run build
npm run preview
```

### Deployment

Deploying to GitHub Pages is pre-configured. Simply run:
```bash
npm run deploy
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
