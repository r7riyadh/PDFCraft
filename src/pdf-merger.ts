import { PDFDocument } from 'pdf-lib';

/**
 * Merges multiple PDF files sequentially into a single PDF document.
 */
export async function mergePDFs(
  files: File[],
  progressCallback?: (percent: number) => void,
  options: { normalizePageSizes?: boolean } = { normalizePageSizes: false }
): Promise<Blob> {
  if (files.length === 0) {
    throw new Error("No files selected for merging");
  }

  progressCallback?.(10);

  // Create a new blank PDF document
  const mergedPdf = await PDFDocument.create();
  
  progressCallback?.(25);

  let targetSize: { width: number; height: number } | null = null;
  const totalFiles = files.length;
  for (let i = 0; i < totalFiles; i++) {
    const file = files[i];
    
    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isPNG = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
    const isJPG = file.type === 'image/jpeg' || file.type === 'image/jpg' || /\.(jpe?g)$/i.test(file.name);

    if (isPDF) {
      // Read the PDF file into an ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      const donorPdf = await PDFDocument.load(arrayBuffer);
      const copiedPages = await mergedPdf.copyPages(
        donorPdf,
        donorPdf.getPageIndices()
      );
      
      copiedPages.forEach((page) => {
        const pageSize = page.getSize();
        
        if (targetSize === null) {
          targetSize = { width: pageSize.width, height: pageSize.height };
        } else if (options.normalizePageSizes) {
          if (pageSize.width !== targetSize.width) {
            const scale = targetSize.width / pageSize.width;
            page.scale(scale, scale);
          }
        }
        mergedPdf.addPage(page);
      });
    } else if (isPNG || isJPG) {
      const arrayBuffer = await file.arrayBuffer();
      const image = isPNG 
        ? await mergedPdf.embedPng(arrayBuffer)
        : await mergedPdf.embedJpg(arrayBuffer);
      
      const { width, height } = image.scale(1.0);
      
      let pageW = width;
      let pageH = height;
      
      if (targetSize !== null && options.normalizePageSizes) {
        const scale = targetSize.width / width;
        pageW = targetSize.width;
        pageH = height * scale;
      }
      
      if (targetSize === null) {
        targetSize = { width: pageW, height: pageH };
      }
      
      const page = mergedPdf.addPage([pageW, pageH]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: pageW,
        height: pageH
      });
    }

    // Calculate progress (from 25% to 90%)
    const percent = 25 + Math.round(((i + 1) / totalFiles) * 65);
    progressCallback?.(percent);
  }

  progressCallback?.(90);

  // Serialize the PDF document to bytes
  const mergedPdfBytes = await mergedPdf.save();
  
  progressCallback?.(98);

  // Return the final merged PDF as a Blob
  const mergedBlob = new Blob([mergedPdfBytes as BlobPart], { type: 'application/pdf' });
  
  progressCallback?.(100);

  return mergedBlob;
}
