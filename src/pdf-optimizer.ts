import { PDFDocument, Image, PDFObject } from 'mupdf';

/**
 * Compresses raw image pixels using HTML5 Canvas scaling and JPEG compression.
 */
function compressImagePixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  newWidth: number,
  newHeight: number,
  components: number,
  quality: number
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;

      // Convert RGB or Grayscale to RGBA for ImageData constructor
      let rgbaArray: Uint8ClampedArray;
      if (components === 4) {
        rgbaArray = pixels;
      } else {
        rgbaArray = new Uint8ClampedArray(width * height * 4);
        let srcIdx = 0;
        let dstIdx = 0;
        const totalPixels = width * height;
        for (let i = 0; i < totalPixels; i++) {
          if (components === 3) {
            rgbaArray[dstIdx] = pixels[srcIdx];       // R
            rgbaArray[dstIdx + 1] = pixels[srcIdx + 1]; // G
            rgbaArray[dstIdx + 2] = pixels[srcIdx + 2]; // B
            rgbaArray[dstIdx + 3] = 255;                // A
            srcIdx += 3;
          } else if (components === 1) {
            const val = pixels[srcIdx];
            rgbaArray[dstIdx] = val;                    // R
            rgbaArray[dstIdx + 1] = val;                // G
            rgbaArray[dstIdx + 2] = val;                // B
            rgbaArray[dstIdx + 3] = 255;                // A
            srcIdx += 1;
          } else {
            rgbaArray[dstIdx] = pixels[srcIdx] || 0;
            rgbaArray[dstIdx + 1] = pixels[srcIdx + 1] || 0;
            rgbaArray[dstIdx + 2] = pixels[srcIdx + 2] || 0;
            rgbaArray[dstIdx + 3] = pixels[srcIdx + 3] || 255;
            srcIdx += components;
          }
          dstIdx += 4;
        }
      }

      const imgData = new ImageData(rgbaArray as any, width, height);
      ctx.putImageData(imgData, 0, 0);

      // Create downscaled canvas
      const scaleCanvas = document.createElement('canvas');
      scaleCanvas.width = newWidth;
      scaleCanvas.height = newHeight;
      const scaleCtx = scaleCanvas.getContext('2d')!;
      scaleCtx.imageSmoothingEnabled = true;
      scaleCtx.imageSmoothingQuality = 'high';
      scaleCtx.drawImage(canvas, 0, 0, newWidth, newHeight);

      // Compress as JPEG
      scaleCanvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Canvas conversion to Blob failed"));
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
          if (reader.result instanceof ArrayBuffer) {
            resolve(new Uint8Array(reader.result));
          } else {
            reject(new Error("FileReader did not yield ArrayBuffer"));
          }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
      }, 'image/jpeg', quality);
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Compresses an uploaded PDF completely client-side in the browser.
 */
export async function compressPDF(
  file: File,
  progressCallback?: (percent: number) => void,
  options: { maxDim: number; quality: number } = { maxDim: 1200, quality: 0.75 }
): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  
  progressCallback?.(10);
  
  // Initialize MuPDF PDFDocument
  const doc = new PDFDocument(uint8);
  
  progressCallback?.(20);

  const compressedImagesCache = new Map<number, PDFObject>();
  const pageCount = doc.countPages();
  
  // Downscale images on each page
  for (let p = 0; p < pageCount; p++) {
    const pageObj = doc.findPage(p);
    const resources = pageObj.get("Resources");
    
    if (!resources.isNull()) {
      const xobjects = resources.get("XObject");
      if (!xobjects.isNull() && xobjects.isDictionary()) {
        const imageRefsToCompress: { key: string; ref: PDFObject }[] = [];
        
        // Collate images first to avoid nested forEach callbacks blocking async canvas ops
        xobjects.forEach((val, key) => {
          const resolved = val.resolve();
          const type = resolved.get("Type");
          const subtype = resolved.get("Subtype");
          if (
            !type.isNull() && type.asName() === "XObject" &&
            !subtype.isNull() && subtype.asName() === "Image"
          ) {
            imageRefsToCompress.push({ key: key as string, ref: val });
          }
        });

        for (const item of imageRefsToCompress) {
          const oldRefNum = item.ref.isIndirect() ? item.ref.asIndirect() : null;
          if (oldRefNum !== null) {
            if (compressedImagesCache.has(oldRefNum)) {
              xobjects.put(item.key, compressedImagesCache.get(oldRefNum)!);
            } else {
              try {
                const img = doc.loadImage(item.ref);
                const width = img.getWidth();
                const height = img.getHeight();
                
                // Downscale large images (e.g. limiting width/height based on selection options)
                const maxDim = options.maxDim;
                if (width > maxDim || height > maxDim) {
                  const scale = maxDim / Math.max(width, height);
                  const newWidth = Math.round(width * scale);
                  const newHeight = Math.round(height * scale);
                  
                  const pixmap = img.toPixmap();
                  const pixels = pixmap.getPixels();
                  const components = pixmap.getNumberOfComponents();
                  
                  // Downscale and recompress image data
                  const compressedData = await compressImagePixels(
                    pixels,
                    width,
                    height,
                    newWidth,
                    newHeight,
                    components,
                    options.quality
                  );
                  
                  const newImg = new Image(compressedData);
                  const newImgRef = doc.addImage(newImg);
                  
                  compressedImagesCache.set(oldRefNum, newImgRef);
                  xobjects.put(item.key, newImgRef);
                }
              } catch (e) {
                console.error(`Failed to compress image at object ref ${oldRefNum}:`, e);
              }
            }
          }
        }
      }
    }
    
    // Scale progress based on page processing
    const percent = Math.min(80, 20 + Math.round((p / pageCount) * 60));
    progressCallback?.(percent);
  }

  // Strip unnecessary metadata
  const metadataKeys = [
    'format', 'encryption', 'info:Creator', 'info:Producer', 
    'info:CreationDate', 'info:ModDate', 'info:Title', 
    'info:Author', 'info:Subject', 'info:Keywords'
  ];
  metadataKeys.forEach(key => {
    try {
      doc.setMetaData(key, '');
    } catch (e) {
      // Ignore key errors
    }
  });

  progressCallback?.(85);

  // Write optimized PDF to buffer
  const saveOptions = {
    compress: true,
    "compress-images": true,
    "compress-fonts": true,
    garbage: "deduplicate",
    linearize: false
  };

  const outputBuffer = doc.saveToBuffer(saveOptions);
  const outputBytes = outputBuffer.asUint8Array();
  
  progressCallback?.(95);

  // Convert to Blob
  const compressedBlob = new Blob([outputBytes as BlobPart], { type: 'application/pdf' });
  
  // Free WebAssembly memory allocations
  doc.destroy();
  
  progressCallback?.(100);

  return compressedBlob;
}
