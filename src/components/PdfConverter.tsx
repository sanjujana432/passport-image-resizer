import React, { useState, useRef } from 'react';
import { Upload, FileText, ImageIcon, Download, Check, Sparkles, X, RefreshCw, Layers, ArrowRight, CornerDownRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// Configure CDN worker dynamically to match installed package version (using v4+ mjs module format from jsdelivr)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface ExtractedImagePage {
  pageNumber: number;
  dataUrl: string;
}

interface ImageItem {
  id: string;
  file: File;
  previewUrl: string;
}

export function PdfConverter() {
  // Navigation tabs inside converter
  const [convType, setConvType] = useState<'imgToPdf' | 'docxToPdf' | 'pdfToImg' | 'pdfToDocx'>('imgToPdf');

  // General states
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Conversions states
  // 1. Image to PDF
  const [imgItems, setImgItems] = useState<ImageItem[]>([]);
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState<string | null>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);

  // Drag & drop sorting for Images to PDF
  const [draggedImgIndex, setDraggedImgIndex] = useState<number | null>(null);
  const [dragOverImgIndex, setDragOverImgIndex] = useState<number | null>(null);

  // 2. Docx to PDF
  const [docxFile, setDocxFile] = useState<File | null>(null);
  const [generatedDocxPdfUrl, setGeneratedDocxPdfUrl] = useState<string | null>(null);
  const docxInputRef = useRef<HTMLInputElement>(null);

  // 3. PDF to Image
  const [pdfSourceFile, setPdfSourceFile] = useState<File | null>(null);
  const [extractedImages, setExtractedImages] = useState<ExtractedImagePage[]>([]);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // 4. PDF to Word
  const [pdfToWordFile, setPdfToWordFile] = useState<File | null>(null);
  const [extractedWordText, setExtractedWordText] = useState<string>('');
  const [generatedWordUrl, setGeneratedWordUrl] = useState<string | null>(null);
  const pdfToWordInputRef = useRef<HTMLInputElement>(null);

  // Reset utilities
  const resetAll = () => {
    setIsProcessing(false);
    setError(null);
    setSuccess(null);
  };

  const clearImagesToPdf = () => {
    imgItems.forEach(item => URL.revokeObjectURL(item.previewUrl));
    setImgItems([]);
    setGeneratedPdfUrl(null);
    setDraggedImgIndex(null);
    setDragOverImgIndex(null);
    resetAll();
  };

  const removeImageItem = (index: number) => {
    setImgItems((prev) => {
      const updated = [...prev];
      const removed = updated.splice(index, 1);
      if (removed[0]) {
        URL.revokeObjectURL(removed[0].previewUrl);
      }
      setGeneratedPdfUrl(null);
      return updated;
    });
  };

  const moveImageLeft = (index: number) => {
    if (index === 0) return;
    setImgItems((prev) => {
      const updated = [...prev];
      const temp = updated[index];
      updated[index] = updated[index - 1];
      updated[index - 1] = temp;
      setGeneratedPdfUrl(null);
      return updated;
    });
  };

  const moveImageRight = (index: number) => {
    if (index === imgItems.length - 1) return;
    setImgItems((prev) => {
      const updated = [...prev];
      const temp = updated[index];
      updated[index] = updated[index + 1];
      updated[index + 1] = temp;
      setGeneratedPdfUrl(null);
      return updated;
    });
  };

  const handleImgDragStart = (e: React.DragEvent, index: number) => {
    setDraggedImgIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleImgDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragOverImgIndex !== index) {
      setDragOverImgIndex(index);
    }
  };

  const handleImgDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedImgIndex === null || draggedImgIndex === targetIndex) {
      setDragOverImgIndex(null);
      setDraggedImgIndex(null);
      return;
    }

    setImgItems((prev) => {
      const next = [...prev];
      const [movedItem] = next.splice(draggedImgIndex, 1);
      next.splice(targetIndex, 0, movedItem);
      setGeneratedPdfUrl(null);
      return next;
    });

    setDraggedImgIndex(null);
    setDragOverImgIndex(null);
  };

  const handleImgDragEnd = () => {
    setDraggedImgIndex(null);
    setDragOverImgIndex(null);
  };

  const clearDocxToPdf = () => {
    setDocxFile(null);
    setGeneratedDocxPdfUrl(null);
    resetAll();
  };

  const clearPdfToImg = () => {
    setPdfSourceFile(null);
    setExtractedImages([]);
    resetAll();
  };

  const clearPdfToWord = () => {
    setPdfToWordFile(null);
    setExtractedWordText('');
    setGeneratedWordUrl(null);
    resetAll();
  };

  // Convert WebP / JPG / PNG into a standardized JPEG ArrayBuffer via canvas
  const normalizeImage = async (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((blob) => {
            if (blob) {
              const reader = new FileReader();
              reader.onloadend = () => {
                if (reader.result instanceof ArrayBuffer) {
                  resolve(reader.result);
                } else {
                  reject(new Error('Failed to parse file array buffer.'));
                }
              };
              reader.readAsArrayBuffer(blob);
            } else {
              reject(new Error('Canvas normalization failed.'));
            }
          }, 'image/jpeg', 0.92);
        } else {
          reject(new Error('Failed to create canvas context.'));
        }
        URL.revokeObjectURL(url);
      };
      img.onerror = (e) => reject(e);
      img.src = url;
    });
  };

  // Handle image-to-PDF compilation
  const handleImagesToPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = (Array.from(e.target.files) as File[]).filter(f => f.type.startsWith('image/'));
      if (filesArray.length === 0) {
        setError('Please select valid image files.');
        return;
      }
      const newItems = filesArray.map(file => ({
        id: Math.random().toString(36).substring(2, 9),
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      setImgItems((prev) => [...prev, ...newItems]);
      setGeneratedPdfUrl(null);
      setError(null);
      setSuccess(null);
    }
  };

  const compileImagesToPdf = async () => {
    if (imgItems.length === 0) return;
    setIsProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      const pdfDoc = await PDFDocument.create();

      for (const item of imgItems) {
        const jpegBuffer = await normalizeImage(item.file);
        const embeddedImg = await pdfDoc.embedJpg(jpegBuffer);
        const { width, height } = embeddedImg;

        // Add page matching the size
        const page = pdfDoc.addPage([width, height]);
        page.drawImage(embeddedImg, {
          x: 0,
          y: 0,
          width,
          height,
        });
      }

      const outPdfBytes = await pdfDoc.save();
      const blob = new Blob([outPdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setGeneratedPdfUrl(url);
      setSuccess(`Successfully compiled ${imgItems.length} image(s) to PDF format.`);
    } catch (err: any) {
      console.error(err);
      setError('Failed to convert images: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadImagesPdf = () => {
    if (!generatedPdfUrl) return;
    const link = document.createElement('a');
    link.href = generatedPdfUrl;
    link.download = `swift_images_converted.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 2. Docx to PDF Converter
  const handleDocxFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.endsWith('.docx')) {
        setError('Please upload a Microsoft Word document (.docx).');
        return;
      }
      setDocxFile(file);
      setGeneratedDocxPdfUrl(null);
      setError(null);
      setSuccess(null);
    }
  };

  // Split a string of text into wrapped lines for PDF
  const wrapText = (text: string, maxChars: number): string[] => {
    const paragraphs = text.split('\n');
    const resultLines: string[] = [];
    
    for (const paragraph of paragraphs) {
      if (paragraph.trim() === '') {
        resultLines.push('');
        continue;
      }

      const words = paragraph.split(' ');
      let currentLine = '';

      for (const word of words) {
        // Simple manual softwrap based on character sizes
        if ((currentLine + ' ' + word).trim().length > maxChars) {
          resultLines.push(currentLine.trim());
          currentLine = word;
        } else {
          currentLine = currentLine === '' ? word : currentLine + ' ' + word;
        }
      }
      if (currentLine !== '') {
        resultLines.push(currentLine.trim());
      }
    }
    return resultLines;
  };

  const compileDocxToPdf = async () => {
    if (!docxFile) return;
    setIsProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      const arrayBuffer = await docxFile.arrayBuffer();
      // Use mammoth to extract plain text
      const extraction = await mammoth.extractRawText({ arrayBuffer });
      const docText = extraction.value;

      if (!docText || docText.trim() === '') {
        throw new Error('This document contains no readable text.');
      }

      // PDF Document compilation with pdf-lib text drawer
      const pdfDoc = await PDFDocument.create();
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      // Letter Dimensions
      const pageWidth = 612;
      const pageHeight = 792;
      const margin = 54;

      // Max characters approximation
      const wrappedLines = wrapText(docText, 78);

      let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      let currentY = pageHeight - margin; // Start content exactly at the top margin
      let pageCount = 1;

      // Render paragraph wrapping
      for (const line of wrappedLines) {
        if (currentY < margin + 15) {
          // Add new page, increment index, and reset content cursor
          currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
          currentY = pageHeight - margin; 
          pageCount++;
        }

        if (line.trim() === '') {
          currentY -= 14; // spacing gap
        } else {
          currentPage.drawText(line, {
            x: margin,
            y: currentY,
            size: 10,
            font: helveticaFont,
            color: rgb(0.16, 0.18, 0.22),
            lineHeight: 14,
          });
          currentY -= 14;
        }
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setGeneratedDocxPdfUrl(url);
      setSuccess(`Imported docx successfully. Generated a polished, paginated document containing ${pageCount} page(s).`);
    } catch (err: any) {
      console.error(err);
      setError('Conversion failed: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadDocxPdf = () => {
    if (!generatedDocxPdfUrl) return;
    const baseName = docxFile ? docxFile.name.substring(0, docxFile.name.lastIndexOf('.')) : 'converted_doc';
    const link = document.createElement('a');
    link.href = generatedDocxPdfUrl;
    link.download = `${baseName}_converted.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 3. PDF to Images converter
  const handlePdfSource = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type !== 'application/pdf') {
        setError('Please load a PDF document.');
        return;
      }
      setPdfSourceFile(file);
      setExtractedImages([]);
      setError(null);
      setSuccess(null);
    }
  };

  const extractPagesAsImages = async () => {
    if (!pdfSourceFile) return;
    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    setExtractedImages([]);

    try {
      const arrayBuffer = await pdfSourceFile.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const total = pdf.numPages;

      const extracted: ExtractedImagePage[] = [];
      const renderLimit = Math.min(total, 12); // safe memory limit config

      for (let pageNum = 1; pageNum <= renderLimit; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 }); // High-quality resolution
        
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
          extracted.push({
            pageNumber: pageNum,
            dataUrl: canvas.toDataURL('image/jpeg', 0.95),
          });
        }
      }

      setExtractedImages(extracted);
      setSuccess(`Rendered ${extracted.length} page(s) as high-contrast JPEG files.`);
    } catch (err: any) {
      console.error(err);
      setError('Failed to extract images: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadExtractedImg = (imgPage: ExtractedImagePage) => {
    const baseName = pdfSourceFile ? pdfSourceFile.name.substring(0, pdfSourceFile.name.lastIndexOf('.')) : 'pdf_page';
    const link = document.createElement('a');
    link.href = imgPage.dataUrl;
    link.download = `${baseName}_page_${imgPage.pageNumber}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 4. PDF to Word converter
  const handlePdfToWordFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type !== 'application/pdf') {
        setError('Please load an actual PDF file.');
        return;
      }
      setPdfToWordFile(file);
      setExtractedWordText('');
      setGeneratedWordUrl(null);
      setError(null);
      setSuccess(null);
    }
  };

  const escapeHtml = (text: string): string => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const compilePdfToWord = async () => {
    if (!pdfToWordFile) return;
    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    setExtractedWordText('');
    setGeneratedWordUrl(null);

    try {
      const arrayBuffer = await pdfToWordFile.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const total = pdf.numPages;

      let fullText = '';
      let htmlBody = '';
      const limit = Math.min(total, 40); // Convert up to 40 pages of text safely clientside

      for (let pageNum = 1; pageNum <= limit; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        let lastY = -1;
        const pageLines: string[] = [];
        let currentLine = '';

        for (const item of textContent.items) {
          if ('str' in item) {
            const currentY = item.transform[5];
            if (lastY !== -1 && Math.abs(currentY - lastY) > 8) {
              if (currentLine.trim() !== '') {
                pageLines.push(currentLine.trim());
              }
              currentLine = item.str;
            } else {
              currentLine += (currentLine === '' ? '' : ' ') + item.str;
            }
            lastY = currentY;
          }
        }
        if (currentLine.trim() !== '') {
          pageLines.push(currentLine.trim());
        }

        const pageTextCombined = pageLines.join('\n\n');
        fullText += (pageNum > 1 ? '\n\n' : '') + pageTextCombined;

        const escapedPageTextHtml = pageLines
          .map(line => `<p style="margin-bottom: 10px; text-align: justify; font-size: 11pt;">${escapeHtml(line)}</p>`)
          .join('');

        if (pageNum > 1) {
          htmlBody += `<br style="page-break-before:always;" />`;
        }
        htmlBody += escapedPageTextHtml;
      }

      setExtractedWordText(fullText);

      // Construct OpenXML/MS-Word compatible HTML document envelope
      const docHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <title>Converted Document</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #334155; padding: 40px; background-color: #ffffff;">
  ${htmlBody}
</body>
</html>`;

      const blob = new Blob([docHtml], { type: 'application/msword;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      setGeneratedWordUrl(url);
      setSuccess(`Successfully extracted textual layouts from ${limit} page(s) and compiled as a Microsoft Word compatible (.doc) document!`);
    } catch (err: any) {
      console.error(err);
      setError('Conversion failed: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadWordDoc = () => {
    if (!generatedWordUrl || !pdfToWordFile) return;
    const baseName = pdfToWordFile.name.substring(0, pdfToWordFile.name.lastIndexOf('.'));
    const link = document.createElement('a');
    link.href = generatedWordUrl;
    link.download = `${baseName}_converted.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper format sizing
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Sub menu controls */}
      <div className="flex flex-wrap gap-1 bg-slate-100 p-1.5 rounded-lg max-w-2xl self-start border border-slate-200">
        <button
          onClick={() => { setConvType('imgToPdf'); resetAll(); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded transition-all ${
            convType === 'imgToPdf'
              ? 'bg-white text-slate-800 shadow-xs'
              : 'text-slate-400 hover:text-slate-600'
          }`}
          type="button"
        >
          <Layers className="w-3.5 h-3.5" />
          Images to PDF
        </button>
        <button
          onClick={() => { setConvType('docxToPdf'); resetAll(); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded transition-all ${
            convType === 'docxToPdf'
              ? 'bg-white text-slate-800 shadow-xs'
              : 'text-slate-400 hover:text-slate-600'
          }`}
          type="button"
        >
          <FileText className="w-3.5 h-3.5" />
          Word to PDF
        </button>
        <button
          onClick={() => { setConvType('pdfToImg'); resetAll(); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded transition-all ${
            convType === 'pdfToImg'
              ? 'bg-white text-slate-800 shadow-xs'
              : 'text-slate-400 hover:text-slate-600'
          }`}
          type="button"
        >
          <ImageIcon className="w-3.5 h-3.5" />
          PDF to Images
        </button>
        <button
          onClick={() => { setConvType('pdfToDocx'); resetAll(); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded transition-all ${
            convType === 'pdfToDocx'
              ? 'bg-white text-slate-800 shadow-xs'
              : 'text-slate-400 hover:text-slate-600'
          }`}
          type="button"
        >
          <FileText className="w-3.5 h-3.5 text-blue-500" />
          PDF to Word
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* SETUP COLUMN */}
        <div className="lg:col-span-5">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-5">
            {convType === 'imgToPdf' && (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Upload Images (WebP/PNG/JPG)
                  </h3>
                  {imgItems.length > 0 && (
                    <button
                      onClick={clearImagesToPdf}
                      className="text-[11px] text-rose-500 hover:text-rose-600 font-bold"
                      type="button"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                <div
                  onClick={() => imgInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.dataTransfer.files) {
                      const filesArray = (Array.from(e.dataTransfer.files) as File[]).filter(f => f.type.startsWith('image/'));
                      if (filesArray.length > 0) {
                        const newItems = filesArray.map(file => ({
                          id: Math.random().toString(36).substring(2, 9),
                          file,
                          previewUrl: URL.createObjectURL(file),
                        }));
                        setImgItems((prev) => [...prev, ...newItems]);
                        setGeneratedPdfUrl(null);
                        setError(null);
                        setSuccess(null);
                      }
                    }
                  }}
                  className="relative border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-slate-50 p-5 rounded-xl text-center cursor-pointer transition-all duration-200 group"
                >
                  <input
                    type="file"
                    ref={imgInputRef}
                    onChange={handleImagesToPdf}
                    accept="image/*"
                    multiple
                    className="hidden"
                  />
                  <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-2.5 group-hover:border-blue-200 group-hover:bg-blue-50 transition-all shadow-3xs">
                    <span className="text-xl font-bold text-slate-400 group-hover:text-blue-500 transition-colors">+</span>
                  </div>
                  <span className="block text-xs font-bold text-slate-600">
                    Add images or <span className="text-blue-600 underline decoration-blue-500/30 group-hover:decoration-blue-500 font-bold">browse</span>
                  </span>
                  <span className="block text-[10px] text-slate-400 mt-0.5">
                    Drag and drop supported
                  </span>
                </div>

                {imgItems.length > 0 && (
                  <div className="flex items-center justify-between bg-slate-50 border border-slate-200/50 rounded-lg p-2.5 text-xs text-slate-600">
                    <span className="font-semibold text-slate-700">Images in Queue:</span>
                    <span className="bg-blue-50 text-blue-700 font-mono font-bold px-2 py-0.5 rounded border border-blue-100">
                      {imgItems.length} Pages
                    </span>
                  </div>
                )}

                {imgItems.length > 0 && (
                  <button
                    onClick={compileImagesToPdf}
                    disabled={isProcessing}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white py-3 rounded-lg text-sm font-semibold shadow-sm flex items-center justify-center gap-2"
                    type="button"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Generating PDF Pages...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Build PDF from Images
                      </>
                    )}
                  </button>
                )}

                {generatedPdfUrl && (
                  <button
                    onClick={downloadImagesPdf}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2"
                    type="button"
                  >
                    <Download className="w-4 h-4" />
                    Download Converted PDF
                  </button>
                )}
              </>
            )}

            {convType === 'docxToPdf' && (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Upload Word Document (.docx)
                  </h3>
                  {docxFile && (
                    <button
                      onClick={clearDocxToPdf}
                      className="text-[11px] text-rose-500 hover:text-rose-600 font-bold"
                      type="button"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {!docxFile ? (
                  <div
                    onClick={() => docxInputRef.current?.click()}
                    className="relative border-2 border-dashed border-slate-200 hover:bg-slate-50 p-6 rounded-lg text-center cursor-pointer transition-colors"
                  >
                    <input
                      type="file"
                      ref={docxInputRef}
                      onChange={handleDocxFile}
                      accept=".docx"
                      className="hidden"
                    />
                    <FileText className="w-9 h-9 text-slate-300 mx-auto mb-2" />
                    <span className="block text-xs font-semibold text-slate-600">
                      Upload your word document or <span className="text-blue-600 underline">browse</span>
                    </span>
                    <span className="block text-[10px] text-slate-400 mt-1">
                      Converts .docx completely client-side.
                    </span>
                  </div>
                ) : (
                  <div className="border border-slate-200 bg-slate-50/50 p-3.5 rounded-lg flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-50 text-blue-600 border border-blue-100 rounded flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold text-slate-800 truncate">{docxFile.name}</h4>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{formatBytes(docxFile.size)}</p>
                    </div>
                  </div>
                )}

                {docxFile && (
                  <button
                    onClick={compileDocxToPdf}
                    disabled={isProcessing}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg text-sm font-semibold shadow-sm flex items-center justify-center gap-2"
                    type="button"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Extracting & Formatting text...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Convert Document to PDF
                      </>
                    )}
                  </button>
                )}

                {generatedDocxPdfUrl && (
                  <button
                    onClick={downloadDocxPdf}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2"
                    type="button"
                  >
                    <Download className="w-4 h-4" />
                    Download Converted PDF
                  </button>
                )}
              </>
            )}

            {convType === 'pdfToImg' && (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Upload Source PDF
                  </h3>
                  {pdfSourceFile && (
                    <button
                      onClick={clearPdfToImg}
                      className="text-[11px] text-rose-500 hover:text-rose-600 font-bold"
                      type="button"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {!pdfSourceFile ? (
                  <div
                    onClick={() => pdfInputRef.current?.click()}
                    className="relative border-2 border-dashed border-slate-200 hover:bg-slate-50 p-6 rounded-lg text-center cursor-pointer transition-colors"
                  >
                    <input
                      type="file"
                      ref={pdfInputRef}
                      onChange={handlePdfSource}
                      accept="application/pdf"
                      className="hidden"
                    />
                    <FileText className="w-9 h-9 text-slate-300 mx-auto mb-2" />
                    <span className="block text-xs font-semibold text-slate-600">
                      Upload target PDF document or <span className="text-blue-600 underline">browse</span>
                    </span>
                    <span className="block text-[10px] text-slate-400 mt-1">
                      Extracts pages as high-quality individual JPG images.
                    </span>
                  </div>
                ) : (
                  <div className="border border-slate-200 bg-slate-50/50 p-3.5 rounded-lg flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-50 text-red-600 border border-red-100 rounded flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold text-slate-800 truncate">{pdfSourceFile.name}</h4>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{formatBytes(pdfSourceFile.size)}</p>
                    </div>
                  </div>
                )}

                {pdfSourceFile && extractedImages.length === 0 && (
                  <button
                    onClick={extractPagesAsImages}
                    disabled={isProcessing}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg text-sm font-semibold shadow-sm flex items-center justify-center gap-2"
                    type="button"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Rendering pages...
                      </>
                    ) : (
                      <>
                        <Layers className="w-4 h-4" />
                        Extract Pages to Images
                      </>
                    )}
                  </button>
                )}
              </>
            )}

            {convType === 'pdfToDocx' && (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Upload PDF for Word Conversion
                  </h3>
                  {pdfToWordFile && (
                    <button
                      onClick={clearPdfToWord}
                      className="text-[11px] text-rose-500 hover:text-rose-600 font-bold"
                      type="button"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {!pdfToWordFile ? (
                  <div
                    onClick={() => pdfToWordInputRef.current?.click()}
                    className="relative border-2 border-dashed border-slate-200 hover:bg-slate-50 p-6 rounded-lg text-center cursor-pointer transition-colors"
                  >
                    <input
                      type="file"
                      ref={pdfToWordInputRef}
                      onChange={handlePdfToWordFile}
                      accept="application/pdf"
                      className="hidden"
                    />
                    <FileText className="w-9 h-9 text-slate-300 mx-auto mb-2" />
                    <span className="block text-xs font-semibold text-slate-600">
                      Upload your PDF document or <span className="text-blue-600 underline">browse</span>
                    </span>
                    <span className="block text-[10px] text-slate-400 mt-1">
                      Extracts formatted text blocks and structures as Editable Word Doc.
                    </span>
                  </div>
                ) : (
                  <div className="border border-slate-200 bg-slate-50/50 p-3.5 rounded-lg flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold text-slate-800 truncate">{pdfToWordFile.name}</h4>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{formatBytes(pdfToWordFile.size)}</p>
                    </div>
                  </div>
                )}

                {pdfToWordFile && !generatedWordUrl && (
                  <button
                    onClick={compilePdfToWord}
                    disabled={isProcessing}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg text-sm font-semibold shadow-sm flex items-center justify-center gap-2"
                    type="button"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Extracting flow text...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Convert PDF to Word
                      </>
                    )}
                  </button>
                )}

                {generatedWordUrl && (
                  <button
                    onClick={downloadWordDoc}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2"
                    type="button"
                  >
                    <Download className="w-4 h-4" />
                    Download Word Document (.doc)
                  </button>
                )}
              </>
            )}

            {/* Error & Success indicators */}
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 p-2.5 rounded-lg text-xs font-semibold">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-2.5 rounded-lg text-xs font-semibold">
                {success}
              </div>
            )}
          </div>
        </div>

        {/* PREVIEW COLUMN */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 min-h-[400px] flex flex-col">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 pb-2 border-b border-slate-100">
              Live Output Preview & Grid
            </h4>

            {convType === 'imgToPdf' && (
              <div className="flex-1 flex flex-col">
                {imgItems.length === 0 ? (
                  <div className="flex-1 flex flex-col justify-center items-center text-center text-slate-400 max-w-sm mx-auto my-12">
                    <Layers className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <h5 className="text-sm font-bold text-slate-700 mb-1">Image to PDF Compiler</h5>
                    <p className="text-xs text-slate-400">Queue up images on the left side, then click compile to generate a unified multi-page catalog.</p>
                  </div>
                ) : (
                  <div className="w-full flex-1 flex flex-col gap-4">
                    {/* Embedded Success Download Banner if PDF is built */}
                    {generatedPdfUrl && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800 flex flex-col sm:flex-row items-center sm:items-center justify-between gap-2.5 shadow-xs animate-fade-in">
                        <div className="flex items-center gap-1.5 font-semibold text-center sm:text-left">
                          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>PDF compilation success! ({imgItems.length} pages ready)</span>
                        </div>
                        <button
                          onClick={downloadImagesPdf}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-md text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors self-stretch sm:self-auto justify-center"
                          type="button"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download Output PDF
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-100 pb-2">
                      <span>Re-order Sequence ({imgItems.length} Pages queued) — Drag cards to re-arrange</span>
                      {generatedPdfUrl && (
                        <span className="text-blue-600 font-bold font-mono text-[10px]">● READY FOR DOWNLOADING</span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 max-h-[460px] overflow-y-auto p-1">
                      {imgItems.map((item, idx) => {
                        const isDragged = draggedImgIndex === idx;
                        const isOver = dragOverImgIndex === idx;
                        return (
                          <div
                            key={item.id}
                            draggable
                            onDragStart={(e) => handleImgDragStart(e, idx)}
                            onDragOver={(e) => handleImgDragOver(e, idx)}
                            onDragLeave={() => setDragOverImgIndex(null)}
                            onDragEnd={handleImgDragEnd}
                            onDrop={(e) => handleImgDrop(e, idx)}
                            className={`relative w-full aspect-[3/4] bg-white border rounded-lg shadow-xs overflow-hidden group flex-shrink-0 transition-all duration-200 cursor-grab active:cursor-grabbing select-none hover:scale-102 hover:shadow-sm ${
                              isDragged
                                ? 'opacity-30 border-dashed border-blue-400 scale-95 ring-2 ring-blue-100'
                                : isOver
                                ? 'border-blue-500 scale-102 ring-2 ring-blue-200 bg-blue-50/50'
                                : 'border-slate-200 hover:border-blue-500'
                            }`}
                            title="Drag to reorder or use arrows below"
                          >
                            {/* Image Thumbnail Preview */}
                            <div className="w-full h-full p-2 bg-white flex items-center justify-center">
                              <img
                                src={item.previewUrl}
                                alt={item.file.name}
                                className="w-full h-full object-contain pointer-events-none select-none"
                              />
                            </div>

                            {/* Sequence Badge overlay */}
                            <div className="absolute top-1.5 left-1.5 bg-slate-900/85 text-white text-[9px] font-bold px-2 py-0.5 rounded shadow-xs z-20 pointer-events-none select-none font-mono">
                              PAGE {idx + 1}
                            </div>

                            {/* Control overlay */}
                            <div className="absolute bottom-0 inset-x-0 bg-slate-900/90 backdrop-blur-3xs py-1.5 px-2 flex items-center justify-between z-25 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveImageLeft(idx);
                                }}
                                disabled={idx === 0}
                                title="Move Left"
                                className="p-1 text-slate-300 hover:text-white disabled:opacity-25 rounded hover:bg-white/10 transition-colors"
                                type="button"
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </button>
                              
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeImageItem(idx);
                                }}
                                title="Remove page"
                                className="p-1 text-rose-400 hover:text-rose-350 rounded hover:bg-white/10 transition-colors"
                                type="button"
                              >
                                <X className="w-4 h-4" />
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveImageRight(idx);
                                }}
                                disabled={idx === imgItems.length - 1}
                                title="Move Right"
                                className="p-1 text-slate-300 hover:text-white disabled:opacity-25 rounded hover:bg-white/10 transition-colors"
                                type="button"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {convType === 'docxToPdf' && (
              <div className="flex-1 flex flex-col justify-center items-center">
                {!generatedDocxPdfUrl ? (
                  <div className="text-center text-slate-400 max-w-sm">
                    <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <h5 className="text-sm font-bold text-slate-700 mb-1">Microsoft Word to PDF Converter</h5>
                    <p className="text-xs text-slate-400">Add a `.docx` file on the left side to compile its paragraphs directly into a paginated corporate document.</p>
                  </div>
                ) : (
                  <div className="w-full flex-1 flex flex-col items-center justify-center gap-4 bg-slate-50 border rounded-lg p-6">
                    <FileText className="w-16 h-16 text-blue-600 bg-blue-50 p-3 rounded" />
                    <div className="text-center text-xs">
                      <span className="block font-bold text-slate-800">{docxFile?.name.replace('.docx', '.pdf')}</span>
                      <span className="block text-[10px] text-slate-400 font-mono mt-1">Paginated and structured cleanly local-first</span>
                    </div>
                    <button
                      onClick={downloadDocxPdf}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold shadow-sm flex items-center gap-1.5"
                      type="button"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Paginated PDF
                    </button>
                  </div>
                )}
              </div>
            )}

            {convType === 'pdfToImg' && (
              <div className="flex-1 flex flex-col justify-center">
                {extractedImages.length === 0 ? (
                  <div className="text-center text-slate-400 max-w-sm mx-auto">
                    <ImageIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <h5 className="text-sm font-bold text-slate-700 mb-1">PDF Page Photo Extractor</h5>
                    <p className="text-xs text-slate-400">Load a multi-frame PDF and extract chapters, schedules, or drawings directly into high-fidelity JPEGs.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-[360px] overflow-y-auto pr-1">
                    {extractedImages.map((img) => (
                      <div key={`idx-${img.pageNumber}`} className="border border-slate-200 rounded bg-slate-50 relative group overflow-hidden flex flex-col">
                        <div className="aspect-[3/4] flex items-center justify-center p-2 bg-white">
                          <img
                            src={img.dataUrl}
                            alt={`Page ${img.pageNumber}`}
                            className="max-h-[120px] object-contain border border-slate-100 shadow-xs"
                          />
                        </div>
                        <div className="p-2 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-500 font-mono">Page {img.pageNumber}</span>
                          <button
                            onClick={() => downloadExtractedImg(img)}
                            className="p-1 px-2 text-[9px] bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded flex items-center gap-0.5"
                            type="button"
                          >
                            <Download className="w-2.5 h-2.5" />
                            JPG
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {convType === 'pdfToDocx' && (
              <div className="flex-1 flex flex-col justify-center">
                {!pdfToWordFile ? (
                  <div className="text-center text-slate-400 max-w-sm mx-auto">
                    <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <h5 className="text-sm font-bold text-slate-700 mb-1">PDF to Microsoft Word Converter</h5>
                    <p className="text-xs text-slate-400 font-sans">Upload your document on the left, then click convert to extract and preview editable word layouts and paragraph styles.</p>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col gap-3 h-full">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-xs text-slate-500 font-medium font-sans">
                      <span>Live Flow Text Extracted Content</span>
                      {generatedWordUrl && (
                        <span className="text-indigo-600 font-bold">● EDITABLE WORD DOC BUILT</span>
                      )}
                    </div>
                    {isProcessing ? (
                      <div className="flex-1 flex flex-col items-center justify-center py-10 text-slate-400 text-xs gap-3">
                        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                        <span>Reconstructing documents... Please wait.</span>
                      </div>
                    ) : extractedWordText ? (
                      <div className="flex-1 flex flex-col gap-3">
                        <div className="border border-slate-200/60 rounded-xl bg-slate-50 p-4 font-mono text-xs text-slate-600 max-h-[380px] overflow-y-auto whitespace-pre-wrap select-text selection:bg-indigo-100 leading-relaxed border-dashed shadow-3xs">
                          {extractedWordText}
                        </div>
                        {generatedWordUrl && (
                          <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg p-3 text-xs text-indigo-900 flex items-center justify-between gap-4">
                            <span className="font-semibold">Ready to draft in Word, Google Docs or LibreOffice</span>
                            <button
                              onClick={downloadWordDoc}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 px-3.5 rounded-md flex items-center gap-1 shrink-0 shadow-3xs transition-colors"
                              type="button"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Download DOC File
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-400 text-xs">
                        <Sparkles className="w-7 h-7 text-indigo-400 animate-pulse mb-2" />
                        <span>Ready to convert. Click on the button on the left to start processing.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
