import { mergePDFs } from './pdf-merger';

// DOM elements
let dropzone: HTMLDivElement;
let fileInput: HTMLInputElement;
let fileList: HTMLDivElement;
let fileListSection: HTMLDivElement;
let fileCountSpan: HTMLSpanElement;
let clearAllBtn: HTMLButtonElement;

let mergeBtn: HTMLButtonElement;
let mergeOnlyBtn: HTMLButtonElement;
let compressBtn: HTMLButtonElement;

let compressLowBtn: HTMLButtonElement;
let compressMediumBtn: HTMLButtonElement;
let compressHighBtn: HTMLButtonElement;

let normalizePagesCheckbox: HTMLInputElement;

// Status Modal elements
let statusOverlay: HTMLDivElement;
let statusIconContainer: HTMLDivElement;
let statusTitle: HTMLHeadingElement;
let statusDescription: HTMLParagraphElement;
let progressBarFill: HTMLDivElement;
let progressPercent: HTMLDivElement;
let statusCloseBtn: HTMLButtonElement;

// State management
let selectedFiles: File[] = [];

// Compression Level Presets & State
type CompressionLevel = 'low' | 'medium' | 'high';
let activeCompressionLevel: CompressionLevel = 'medium';

const COMPRESSION_PRESETS = {
  low: { maxDim: 1000, quality: 0.65 },      // Medium Quality (Standard)
  medium: { maxDim: 1400, quality: 0.80 },   // High Quality (Recommended)
  high: { maxDim: 1800, quality: 0.90 }      // Best Quality (Maximum)
};

const PRESET_LABELS = {
  low: 'Medium',
  medium: 'High',
  high: 'Best'
};

// Initialize application listeners
function init() {
  dropzone = document.getElementById('dropzone') as HTMLDivElement;
  fileInput = document.getElementById('file-input') as HTMLInputElement;
  fileList = document.getElementById('file-list') as HTMLDivElement;
  fileListSection = document.getElementById('file-list-section') as HTMLDivElement;
  fileCountSpan = document.getElementById('file-count') as HTMLSpanElement;
  clearAllBtn = document.getElementById('clear-all-btn') as HTMLButtonElement;

  mergeBtn = document.getElementById('merge-btn') as HTMLButtonElement;
  mergeOnlyBtn = document.getElementById('merge-only-btn') as HTMLButtonElement;
  compressBtn = document.getElementById('compress-btn') as HTMLButtonElement;

  compressLowBtn = document.getElementById('compress-low-btn') as HTMLButtonElement;
  compressMediumBtn = document.getElementById('compress-medium-btn') as HTMLButtonElement;
  compressHighBtn = document.getElementById('compress-high-btn') as HTMLButtonElement;

  normalizePagesCheckbox = document.getElementById('normalize-pages-checkbox') as HTMLInputElement;

  statusOverlay = document.getElementById('status-overlay') as HTMLDivElement;
  statusIconContainer = document.getElementById('status-icon-container') as HTMLDivElement;
  statusTitle = document.getElementById('status-title') as HTMLHeadingElement;
  statusDescription = document.getElementById('status-description') as HTMLParagraphElement;
  progressBarFill = document.getElementById('progress-bar-fill') as HTMLDivElement;
  progressPercent = document.getElementById('progress-percent') as HTMLDivElement;
  statusCloseBtn = document.getElementById('status-close-btn') as HTMLButtonElement;

  if (
    !dropzone || !fileInput || !fileList || !fileListSection || 
    !fileCountSpan || !clearAllBtn || !mergeBtn || !mergeOnlyBtn || !compressBtn || 
    !compressLowBtn || !compressMediumBtn || !compressHighBtn ||
    !normalizePagesCheckbox ||
    !statusOverlay || !statusIconContainer || !statusTitle || 
    !statusDescription || !progressBarFill || !progressPercent || !statusCloseBtn
  ) {
    console.error("Core UI elements not found in the DOM");
    return;
  }

  // Prevent default drag/drop behaviors on window to stop Chrome from opening files
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    window.addEventListener(eventName, preventDefaults, false);
  });

  // Drag and drop event listeners
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, highlight, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, unhighlight, false);
  });

  dropzone.addEventListener('dragover', preventDefaults, false);
  dropzone.addEventListener('dragenter', preventDefaults, false);
  dropzone.addEventListener('dragleave', preventDefaults, false);
  dropzone.addEventListener('drop', preventDefaults, false);

  // File drop/click upload trigger
  dropzone.addEventListener('drop', handleDrop, false);
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileSelect);

  // Compression preset selection listeners
  const setupPresetBtn = (btn: HTMLButtonElement, level: CompressionLevel) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      activeCompressionLevel = level;
      
      // Reset visual active classes
      [compressLowBtn, compressMediumBtn, compressHighBtn].forEach(b => {
        b.className = "py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 text-center";
        const subtitle = b.querySelector('span');
        if (subtitle) {
          subtitle.className = "block text-[10px] text-slate-500 font-normal mt-0.5";
        }
      });

      // Highlight active button
      btn.className = "py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer bg-slate-200 text-slate-950 shadow-md text-center";
      const sub = btn.querySelector('span');
      if (sub) {
        sub.className = "block text-[10px] text-slate-600 font-normal mt-0.5";
      }
    });
  };

  setupPresetBtn(compressLowBtn, 'low');
  setupPresetBtn(compressMediumBtn, 'medium');
  setupPresetBtn(compressHighBtn, 'high');

  // Control button actions
  clearAllBtn.addEventListener('click', clearAllFiles);
  mergeBtn.addEventListener('click', () => startProcessing('merge'));
  mergeOnlyBtn.addEventListener('click', () => startProcessing('merge-only'));
  compressBtn.addEventListener('click', () => startProcessing('compress'));

  statusCloseBtn.addEventListener('click', closeStatusOverlay);
}

// Prevent default drag/drop behaviors
function preventDefaults(e: Event) {
  e.preventDefault();
  e.stopPropagation();
}

// Dropzone highlight styling
function highlight() {
  dropzone.classList.add('dropzone-active');
}

function unhighlight() {
  dropzone.classList.remove('dropzone-active');
}

// Drag & drop file parser
function handleDrop(e: DragEvent) {
  const dt = e.dataTransfer;
  if (dt) {
    const files = Array.from(dt.files);
    addFiles(files);
  }
}

// File explorer selection parser
function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.files) {
    const files = Array.from(target.files);
    addFiles(files);
  }
}

// Filter and add files to state
async function addFiles(files: File[]) {
  // Filters out unsupported files
  const filesToProcess = files.filter(file => {
    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|heic|heif)$/i.test(file.name);
    return isPDF || isImage;
  });

  if (filesToProcess.length < files.length) {
    showToast("Skipped unsupported files. Only PDFs, PNGs, JPEGs, and HEICs are supported.", "info");
  }

  const processedFiles: File[] = [];

  for (const file of filesToProcess) {
    const isHEIC = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');
    if (isHEIC) {
      showToast(`Converting HEIC image: "${file.name}"...`, "info");
      try {
        const heic2anyModule = await import('heic2any');
        const heic2any = heic2anyModule.default;
        
        // Convert HEIC to JPEG
        const conversionResult = await heic2any({
          blob: file,
          toType: 'image/jpeg',
          quality: 0.8
        });

        // heic2any can return a Blob or Blob[]
        const jpegBlob = Array.isArray(conversionResult) ? conversionResult[0] : conversionResult;
        
        const newName = file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');
        const convertedFile = new File([jpegBlob], newName, { type: 'image/jpeg' });
        processedFiles.push(convertedFile);
        showToast(`HEIC image converted successfully!`, "success");
      } catch (error) {
        console.error("HEIC conversion failed:", error);
        showToast(`Failed to convert HEIC file: "${file.name}"`, "error");
      }
    } else {
      processedFiles.push(file);
    }
  }

  selectedFiles = [...selectedFiles, ...processedFiles];
  renderFileList();
  updateButtonStates();
  // Reset file input value so selection can be repeated
  fileInput.value = '';
}

// Remove single file
function removeFile(index: number) {
  selectedFiles.splice(index, 1);
  renderFileList();
  updateButtonStates();
}

// Re-order selected files (vital for Merging)
function moveFile(index: number, direction: 'up' | 'down') {
  const newIndex = direction === 'up' ? index - 1 : index + 1;
  if (newIndex < 0 || newIndex >= selectedFiles.length) return;

  const temp = selectedFiles[index];
  selectedFiles[index] = selectedFiles[newIndex];
  selectedFiles[newIndex] = temp;

  renderFileList();
  updateButtonStates();
}

// Clear all files from state
function clearAllFiles() {
  selectedFiles = [];
  renderFileList();
  updateButtonStates();
}

// Render files list into DOM
function renderFileList() {
  if (selectedFiles.length === 0) {
    fileListSection.classList.add('hidden');
    fileList.innerHTML = '';
    fileCountSpan.textContent = '0';
    return;
  }

  fileListSection.classList.remove('hidden');
  fileCountSpan.textContent = selectedFiles.length.toString();

  fileList.innerHTML = '';
  selectedFiles.forEach((file, index) => {
    const sizeInMB = file.size / (1024 * 1024);
    const sizeString = sizeInMB < 0.1 
      ? `${(file.size / 1024).toFixed(1)} KB` 
      : `${sizeInMB.toFixed(2)} MB`;

    const isImage = file.type.startsWith('image/') || /\.(png|jpe?g)$/i.test(file.name);
    const iconClass = isImage
      ? 'p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0'
      : 'p-2 rounded-lg bg-rose-500/10 text-rose-500 border border-rose-500/20 shrink-0';
    const svgIcon = isImage
      ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
           <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
         </svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
           <path stroke-linecap="round" stroke-linejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
         </svg>`;

    // Render individual file row card
    const fileCard = document.createElement('div');
    fileCard.className = 'flex items-center justify-between p-3.5 bg-slate-900/40 hover:bg-slate-900/60 border border-white/5 hover:border-white/10 rounded-xl transition-all duration-200 group';
    
    fileCard.innerHTML = `
      <div class="flex items-center gap-3 min-w-0 flex-grow">
        <!-- File icon -->
        <div class="${iconClass}">
          ${svgIcon}
        </div>
        <div class="min-w-0 flex-grow">
          <p class="text-sm font-semibold text-slate-200 truncate pr-4" title="${file.name}">
            ${file.name}
          </p>
          <p class="text-xs text-slate-500 font-medium mt-0.5">
            ${sizeString}
          </p>
        </div>
      </div>

      <!-- Controls -->
      <div class="flex items-center gap-1 shrink-0">
        <!-- Move Up Button -->
        <button class="move-up-btn p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-30 disabled:hover:text-slate-500 disabled:hover:bg-transparent transition-colors cursor-pointer" 
          ${index === 0 ? 'disabled' : ''} title="Move Up">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>

        <!-- Move Down Button -->
        <button class="move-down-btn p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-30 disabled:hover:text-slate-500 disabled:hover:bg-transparent transition-colors cursor-pointer" 
          ${index === selectedFiles.length - 1 ? 'disabled' : ''} title="Move Down">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <!-- Vertical Divider -->
        <div class="w-px h-5 bg-slate-800 mx-1"></div>

        <!-- Remove Button -->
        <button class="remove-btn p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer" title="Remove File">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    `;

    // Hook up row-specific actions
    fileCard.querySelector('.move-up-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      moveFile(index, 'up');
    });

    fileCard.querySelector('.move-down-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      moveFile(index, 'down');
    });

    fileCard.querySelector('.remove-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFile(index);
    });

    fileList.appendChild(fileCard);
  });
}

// Manage dynamic button states
function updateButtonStates() {
  const count = selectedFiles.length;

  // Merge options require at least 2 files
  if (count >= 2) {
    mergeBtn.removeAttribute('disabled');
    mergeOnlyBtn.removeAttribute('disabled');
  } else {
    mergeBtn.setAttribute('disabled', 'true');
    mergeOnlyBtn.setAttribute('disabled', 'true');
  }

  // Compress options require at least 1 file
  if (count >= 1) {
    compressBtn.removeAttribute('disabled');
  } else {
    compressBtn.setAttribute('disabled', 'true');
  }
}

// Start processing sequence
async function startProcessing(action: 'merge' | 'compress' | 'merge-only') {
  if (action === 'merge' && selectedFiles.length < 2) return;
  if (action === 'merge-only' && selectedFiles.length < 2) return;
  if (action === 'compress' && selectedFiles.length < 1) return;

  // Show status overlay and reset progress
  statusOverlay.classList.remove('hidden');
  // Small timeout to trigger CSS transition opacity
  setTimeout(() => {
    statusOverlay.classList.remove('opacity-0');
  }, 10);

  statusCloseBtn.classList.add('hidden');
  statusIconContainer.className = "w-16 h-16 rounded-full flex items-center justify-center mb-6 text-brand-500 bg-brand-500/10";
  
  // Spinner logo
  statusIconContainer.innerHTML = `
    <svg class="animate-spin h-8 w-8 text-brand-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  `;

  statusTitle.textContent = action === 'merge' 
    ? 'Merging & Compressing' 
    : action === 'merge-only' 
    ? 'Merging PDFs' 
    : 'Compressing PDFs';

  statusDescription.textContent = action === 'merge' 
    ? `Combining and optimizing ${selectedFiles.length} files in-browser. Please wait...`
    : action === 'merge-only'
    ? `Combining ${selectedFiles.length} files in-browser. Please wait...`
    : `Analyzing and compressing PDF contents locally. Please wait...`;

  progressBarFill.style.width = '0%';
  progressPercent.textContent = '0%';

  if (action === 'compress') {
    try {
      const totalFiles = selectedFiles.length;
      let filesProcessed = 0;
      const preset = COMPRESSION_PRESETS[activeCompressionLevel];

      for (let i = 0; i < totalFiles; i++) {
        const file = selectedFiles[i];
        
        const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const isPNG = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
        
        let compressedBlob: Blob;

        if (isPDF) {
          statusDescription.textContent = `Compressing PDF ${i + 1} of ${totalFiles}: "${file.name}" [${PRESET_LABELS[activeCompressionLevel]} Quality]...`;
          const { compressPDF } = await import('./pdf-optimizer');
          compressedBlob = await compressPDF(file, (percent) => {
            // Map local file progress to global progress bar
            const globalPercent = Math.round(((filesProcessed + (percent / 100)) / totalFiles) * 100);
            progressBarFill.style.width = `${globalPercent}%`;
            progressPercent.textContent = `${globalPercent}%`;
          }, preset);
        } else {
          statusDescription.textContent = `Compressing image ${i + 1} of ${totalFiles}: "${file.name}" [${PRESET_LABELS[activeCompressionLevel]} Quality]...`;
          
          progressBarFill.style.width = `${Math.round(((filesProcessed + 0.1) / totalFiles) * 100)}%`;
          progressPercent.textContent = `${Math.round(((filesProcessed + 0.1) / totalFiles) * 100)}%`;

          const { compressImageFile } = await import('./pdf-optimizer');
          compressedBlob = await compressImageFile(file, preset.maxDim, preset.quality);

          progressBarFill.style.width = `${Math.round(((filesProcessed + 1.0) / totalFiles) * 100)}%`;
          progressPercent.textContent = `${Math.round(((filesProcessed + 1.0) / totalFiles) * 100)}%`;
        }

        // Trigger file download
        const url = URL.createObjectURL(compressedBlob);
        const a = document.createElement('a');
        a.href = url;
        const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        const ext = isPDF ? 'pdf' : (isPNG ? 'png' : 'jpg');
        a.download = `${nameWithoutExt}_compressed.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        filesProcessed++;
      }

      // Success state UI
      statusTitle.textContent = 'PDFs Compressed Successfully';
      statusDescription.textContent = `Successfully compressed and downloaded ${totalFiles} file(s) [${PRESET_LABELS[activeCompressionLevel]} Quality].`;
      statusIconContainer.className = "w-16 h-16 rounded-full flex items-center justify-center mb-6 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20";
      statusIconContainer.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      `;
      statusCloseBtn.classList.remove('hidden');

      showToast("PDF files compressed successfully!", "success");

    } catch (e) {
      console.error("Compression error:", e);
      statusTitle.textContent = 'Compression Failed';
      statusDescription.textContent = `An error occurred during PDF compression: ${e instanceof Error ? e.message : String(e)}`;
      statusIconContainer.className = "w-16 h-16 rounded-full flex items-center justify-center mb-6 text-rose-500 bg-rose-500/10 border border-rose-500/20";
      statusIconContainer.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      `;
      statusCloseBtn.classList.remove('hidden');

      showToast(`Error compressing PDF: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  } else if (action === 'merge-only') {
    // Merge Only pipeline
    try {
      statusTitle.textContent = 'Merging PDFs';
      statusDescription.textContent = `Merging ${selectedFiles.length} files in-browser...`;
      
      const normalize = normalizePagesCheckbox.checked;
      const mergedBlob = await mergePDFs(selectedFiles, (percent) => {
        progressBarFill.style.width = `${percent}%`;
        progressPercent.textContent = `${percent}%`;
      }, { normalizePageSizes: normalize });

      // Trigger file download of the merged PDF
      const url = URL.createObjectURL(mergedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `merged_document.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Success state UI
      statusTitle.textContent = 'Merged Successfully';
      statusDescription.textContent = `Successfully merged ${selectedFiles.length} file(s) into one document.`;
      statusIconContainer.className = "w-16 h-16 rounded-full flex items-center justify-center mb-6 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20";
      statusIconContainer.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      `;
      statusCloseBtn.classList.remove('hidden');

      showToast("PDFs successfully merged!", "success");

    } catch (e) {
      console.error("Merging error:", e);
      statusTitle.textContent = 'Merging Failed';
      statusDescription.textContent = `An error occurred: ${e instanceof Error ? e.message : String(e)}`;
      statusIconContainer.className = "w-16 h-16 rounded-full flex items-center justify-center mb-6 text-rose-500 bg-rose-500/10 border border-rose-500/20";
      statusIconContainer.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      `;
      statusCloseBtn.classList.remove('hidden');

      showToast(`Error merging PDFs: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  } else {
    // Combined Merge and Compress pipeline
    try {
      statusTitle.textContent = 'Processing PDF Tool';
      statusDescription.textContent = `Phase 1 of 2: Merging selected files in-browser...`;
      const preset = COMPRESSION_PRESETS[activeCompressionLevel];
      
      const normalize = normalizePagesCheckbox.checked;
      const mergedBlob = await mergePDFs(selectedFiles, (percent) => {
        // Mapping merge progress to 0% - 50% global progress
        const globalPercent = Math.round(percent / 2);
        progressBarFill.style.width = `${globalPercent}%`;
        progressPercent.textContent = `${globalPercent}%`;
      }, { normalizePageSizes: normalize });

      statusDescription.textContent = `Phase 2 of 2: Optimizing and compressing merged document [${PRESET_LABELS[activeCompressionLevel]} Quality]...`;

      // Convert Blob to File object for compressor utility
      const mergedFile = new File([mergedBlob], "merged.pdf", { type: "application/pdf" });

      const { compressPDF } = await import('./pdf-optimizer');
      const finalBlob = await compressPDF(mergedFile, (percent) => {
        // Mapping compression progress to 50% - 100% global progress
        const globalPercent = 50 + Math.round(percent / 2);
        progressBarFill.style.width = `${globalPercent}%`;
        progressPercent.textContent = `${globalPercent}%`;
      }, preset);

      // Trigger file download of the fully merged and compressed PDF
      const url = URL.createObjectURL(finalBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `merged_and_compressed.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Success state UI
      statusTitle.textContent = 'Processed Successfully';
      statusDescription.textContent = `Successfully merged and compressed ${selectedFiles.length} file(s) into one document [${PRESET_LABELS[activeCompressionLevel]} Quality].`;
      statusIconContainer.className = "w-16 h-16 rounded-full flex items-center justify-center mb-6 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20";
      statusIconContainer.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      `;
      statusCloseBtn.classList.remove('hidden');

      showToast("PDFs successfully merged and compressed!", "success");

    } catch (e) {
      console.error("Merging & Compression error:", e);
      statusTitle.textContent = 'Processing Failed';
      statusDescription.textContent = `An error occurred: ${e instanceof Error ? e.message : String(e)}`;
      statusIconContainer.className = "w-16 h-16 rounded-full flex items-center justify-center mb-6 text-rose-500 bg-rose-500/10 border border-rose-500/20";
      statusIconContainer.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      `;
      statusCloseBtn.classList.remove('hidden');

      showToast(`Error processing PDF: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }
}

// Hide the status overlay
function closeStatusOverlay() {
  statusOverlay.classList.add('opacity-0');
  // Wait for the CSS transition to complete before adding hidden class
  setTimeout(() => {
    statusOverlay.classList.add('hidden');
  }, 300);
}

/**
 * Creates and displays toast notifications for error/success reporting.
 */
function showToast(message: string, type: 'error' | 'success' | 'info' = 'error') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `flex items-center gap-3 p-4 rounded-xl border text-sm font-semibold pointer-events-auto shadow-lg toast-enter ${
    type === 'error'
      ? 'bg-rose-950/80 border-rose-500/20 text-rose-200'
      : type === 'success'
      ? 'bg-emerald-950/80 border-emerald-500/20 text-emerald-200'
      : 'bg-slate-900/80 border-slate-700/20 text-slate-200'
  }`;

  const icon = type === 'error'
    ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
         <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
       </svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
         <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
       </svg>`;

  toast.innerHTML = `
    ${icon}
    <div class="flex-grow">${message}</div>
    <button class="toast-close-btn text-slate-400 hover:text-white transition-colors p-0.5 rounded focus:outline-none focus:ring-1 focus:ring-slate-500 cursor-pointer ml-1">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  `;

  toast.querySelector('.toast-close-btn')?.addEventListener('click', () => {
    removeToast(toast);
  });

  container.appendChild(toast);

  // Auto-expire toast in 4.5s
  setTimeout(() => {
    removeToast(toast);
  }, 4500);
}

function removeToast(toast: HTMLDivElement) {
  if (toast.classList.contains('toast-exit')) return;
  toast.classList.remove('toast-enter');
  toast.classList.add('toast-exit');
  setTimeout(() => {
    toast.remove();
  }, 350);
}

// Initialize on page ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
