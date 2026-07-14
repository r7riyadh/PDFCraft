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
    
    // Read the PDF file into an ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    
    // Load the donor PDF document
    const donorPdf = await PDFDocument.load(arrayBuffer);
    
    // Copy all pages from the donor PDF into the new document
    const copiedPages = await mergedPdf.copyPages(
      donorPdf,
      donorPdf.getPageIndices()
    );
    
    // Add each copied page to the new document
    copiedPages.forEach((page) => {
      const pageSize = page.getSize();
      
      if (targetSize === null) {
        targetSize = { width: pageSize.width, height: pageSize.height };
      } else if (options.normalizePageSizes) {
        if (pageSize.width !== targetSize.width) {
          // Compute scale factor based on matching page width to target width
          const scale = targetSize.width / pageSize.width;
          page.scale(scale, scale);
        }
      }

      mergedPdf.addPage(page);
    });

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
