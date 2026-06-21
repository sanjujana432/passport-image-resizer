import React, { useState, useRef, useEffect } from 'react';
import { Upload, Trash2, ArrowRight, Sparkles, FileText, Plus, X, ChevronLeft, ChevronRight, Download, Check, RefreshCw, Info } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

// Configure CDN worker dynamically to match installed package version (using v4+ mjs module format from jsdelivr)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface PagePreviewProps {
  pageNum: number;
  pdfDoc: any;
  renderedThumbs: Record<number, string>;
  onRendered: (pageNum: number, dataUrl: string) => void;
  className?: string;
  minHeight?: string;
}

const PagePreview: React.FC<PagePreviewProps> = ({
  pageNum,
  pdfDoc,
  renderedThumbs,
  onRendered,
  className = "w-full h-full object-contain",
  minHeight
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const renderAttempted = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;
    
    if (renderedThumbs[pageNum]) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' } // Load early before it enters the viewport
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [pageNum, renderedThumbs]);

  useEffect(() => {
    if (!isInView || !pdfDoc || renderedThumbs[pageNum] || renderAttempted.current) return;

    renderAttempted.current = true;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 0.5 }); // High-quality 0.5 rendering scale to fill big boxes nicely
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (context) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({ canvasContext: context, viewport, canvas } as any).promise;
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          onRendered(pageNum, dataUrl);
        }
      } catch (err) {
        console.error('Error rendering page:', pageNum, err);
        renderAttempted.current = false; // Allow retry on failure
      }
    };

    renderPage();
  }, [isInView, pdfDoc, pageNum, renderedThumbs, onRendered]);

  const cachedSrc = renderedThumbs[pageNum];

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full flex items-center justify-center bg-white relative overflow-hidden" 
      style={minHeight ? { minHeight } : undefined}
    >
      {cachedSrc ? (
        <img
          src={cachedSrc}
          alt={`Page ${pageNum}`}
          className={className}
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 text-slate-400 gap-1.5 p-2">
          <RefreshCw className="w-4 h-4 animate-spin text-slate-300" />
          <span className="text-[10px] font-semibold text-slate-400 text-center">Page {pageNum}</span>
        </div>
      )}
    </div>
  );
};

export function PdfSplitter() {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [inputVal, setInputVal] = useState<string>('');
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [compiledPdfUrl, setCompiledPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // States for lazy loading previews
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [renderedThumbs, setRenderedThumbs] = useState<Record<number, string>>({});

  // States for drag-and-drop reordering
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [draggedSourcePage, setDraggedSourcePage] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper callback to buffer rendered base64s at parent level
  const handlePageRendered = (pageNum: number, dataUrl: string) => {
    setRenderedThumbs(prev => {
      if (prev[pageNum] === dataUrl) return prev;
      return {
        ...prev,
        [pageNum]: dataUrl
      };
    });
  };

  // Drag & drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleSourceDragStart = (e: React.DragEvent, pageNum: number) => {
    e.dataTransfer.setData("text/plain", `source-page:${pageNum}`);
    e.dataTransfer.effectAllowed = "copy";
    setDraggedSourcePage(pageNum);
  };

  const handleSourceDragEnd = () => {
    setDraggedSourcePage(null);
  };

  const handleContainerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleContainerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sourceData = e.dataTransfer.getData("text/plain");
    if (sourceData && sourceData.startsWith("source-page:")) {
      const pageNum = parseInt(sourceData.split(":")[1], 10);
      if (!isNaN(pageNum)) {
        setSelectedPages((prev) => {
          const next = [...prev, pageNum];
          setInputVal(next.join(', '));
          return next;
        });
      }
    }
    setDraggedSourcePage(null);
    setDragOverIndex(null);
    setDraggedIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    const sourceData = e.dataTransfer.getData("text/plain");
    if (sourceData && sourceData.startsWith("source-page:")) {
      const pageNum = parseInt(sourceData.split(":")[1], 10);
      if (!isNaN(pageNum)) {
        setSelectedPages((prev) => {
          const next = [...prev];
          next.splice(targetIndex, 0, pageNum);
          setInputVal(next.join(', '));
          return next;
        });
      }
      setDraggedSourcePage(null);
      setDragOverIndex(null);
      setDraggedIndex(null);
      return;
    }

    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDragOverIndex(null);
      setDraggedIndex(null);
      return;
    }

    setSelectedPages((prev) => {
      const next = [...prev];
      const [movedItem] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, movedItem);
      setInputVal(next.join(', '));
      return next;
    });

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
    setDraggedSourcePage(null);
  };

  // Clear states
  const handleClear = () => {
    setFile(null);
    setNumPages(0);
    setSelectedPages([]);
    setInputVal('');
    setCompiledPdfUrl(null);
    setError(null);
    setSuccess(null);
    setPdfDocument(null);
    setRenderedThumbs({});
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Convert uploaded PDF to thumbnails
  const processPdfFile = async (selectedFile: File) => {
    if (!selectedFile || selectedFile.type !== 'application/pdf') {
      setError('Please upload a valid PDF document.');
      return;
    }

    setLoading(true);
    setError(null);
    setCompiledPdfUrl(null);
    setSelectedPages([]);
    setInputVal('');
    setRenderedThumbs({});

    try {
      setFile(selectedFile);
      const arrayBuffer = await selectedFile.arrayBuffer();
      
      // Load PDF using pdfjs
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      
      setNumPages(pdf.numPages);
      setPdfDocument(pdf);
      
      // Automatically pre-select first 4 pages if they exist, or all if less than 4
      const initialPages = Array.from({ length: Math.min(pdf.numPages, 4) }, (_, i) => i + 1);
      setSelectedPages(initialPages);
      setInputVal(initialPages.join(', '));
    } catch (err: any) {
      console.error(err);
      setError('Failed to load PDF file. The file might be password-protected or corrupted.');
      setFile(null);
      setPdfDocument(null);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processPdfFile(e.target.files[0]);
    }
  };

  // Update selection via input field
  const handleInputChange = (val: string) => {
    setInputVal(val);
    const parsed = val
      .split(',')
      .map((item) => parseInt(item.trim(), 10))
      .filter((num) => !isNaN(num) && num >= 1 && num <= numPages);
    setSelectedPages(parsed);
  };

  // Toggle page selection
  const togglePageSelection = (pageNum: number) => {
    setSelectedPages((prev) => {
      let next: number[];
      if (prev.includes(pageNum)) {
        next = prev.filter((p) => p !== pageNum);
      } else {
        next = [...prev, pageNum];
      }
      setInputVal(next.join(', '));
      return next;
    });
  };

  // Move a page left in sequence
  const movePageLeft = (index: number) => {
    if (index === 0) return;
    setSelectedPages((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[index - 1];
      next[index - 1] = temp;
      setInputVal(next.join(', '));
      return next;
    });
  };

  // Move a page right in sequence
  const movePageRight = (index: number) => {
    setSelectedPages((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      const temp = next[index];
      next[index] = next[index + 1];
      next[index + 1] = temp;
      setInputVal(next.join(', '));
      return next;
    });
  };

  // Remove a page from sequence by index
  const removePageFromSequence = (index: number) => {
    setSelectedPages((prev) => {
      const next = prev.filter((_, i) => i !== index);
      setInputVal(next.join(', '));
      return next;
    });
  };

  // Compile split PDF
  const handleCompilePdf = async () => {
    if (!file || selectedPages.length === 0) {
      setError('Please upload a PDF and specify at least one page to export.');
      return;
    }

    setIsCompiling(true);
    setError(null);
    setSuccess(null);
    setCompiledPdfUrl(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const sourcePdf = await PDFDocument.load(arrayBuffer);
      const outPdf = await PDFDocument.create();

      // Copy each selected page sequentially
      for (const pageNum of selectedPages) {
        if (pageNum >= 1 && pageNum <= sourcePdf.getPageCount()) {
          const [copiedPage] = await outPdf.copyPages(sourcePdf, [pageNum - 1]);
          outPdf.addPage(copiedPage);
        }
      }

      const outBytes = await outPdf.save();
      const blob = new Blob([outBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setCompiledPdfUrl(url);
      setSuccess(`Successfully generated PDF with ${selectedPages.length} pages structured to your target layout!`);
    } catch (err: any) {
      console.error(err);
      setError('An error occurred while compiling the PDF: ' + err.message);
    } finally {
      setIsCompiling(false);
    }
  };

  const downloadCompiledPdf = () => {
    if (!compiledPdfUrl) return;
    const baseName = file ? file.name.substring(0, file.name.lastIndexOf('.')) : 'swift_pdf';
    const link = document.createElement('a');
    link.href = compiledPdfUrl;
    link.download = `${baseName}_rearranged.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Format bytes
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 1;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Drag over target prevent default
  const handleDragOverHost = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDropHost = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processPdfFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" onDragOver={handleDragOverHost} onDrop={handleDropHost}>
      {/* LEFT COLUMN: Split Setup Sidebar */}
      <div className="lg:col-span-5 flex flex-col gap-5">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              1. Upload Source PDF
            </h3>
            {file && (
              <button
                onClick={handleClear}
                className="text-[11px] text-rose-500 hover:text-rose-600 font-semibold flex items-center gap-1 transition-colors"
                type="button"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Document
              </button>
            )}
          </div>

          {!file ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="relative border-2 border-dashed border-slate-200 hover:bg-slate-50 p-6 rounded-lg text-center cursor-pointer transition-colors"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="application/pdf"
                className="hidden"
              />
              <Upload className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <span className="block text-xs font-semibold text-slate-600">
                Drop your PDF file here or <span className="text-blue-600 underline">click to browse</span>
              </span>
              <span className="block text-[10px] text-slate-400 mt-1">
                Supports PDFs of any size
              </span>
            </div>
          ) : (
            <div className="border border-slate-200 bg-slate-5 * p-3.5 rounded-lg flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 text-red-600 rounded flex items-center justify-center border border-red-100 flex-shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-slate-800 truncate">{file.name}</h4>
                <div className="flex gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                  <span>{formatBytes(file.size)}</span>
                  <span>•</span>
                  <span>{numPages} total pages</span>
                </div>
              </div>
            </div>
          )}

          {file && (
            <div className="flex flex-col gap-3 pt-3 border-t border-slate-100">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                2. Specify Page Collection
              </h4>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-slate-500">
                  Target sequence (1-based, comma separated)
                </label>
                <input
                  type="text"
                  value={inputVal}
                  onChange={(e) => handleInputChange(e.target.value)}
                  placeholder="e.g. 1, 3, 5, 2, 4"
                  className="w-full text-xs font-semibold border border-slate-200 rounded px-3 py-2 bg-slate-50 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none font-mono"
                />
                <p className="text-[10px] text-slate-400 leading-normal">
                  You can type continuous page ranges and custom ordering. (e.g. <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-600 font-bold">1, 2, 2, 5</code> to duplicate or reorder).
                </p>
              </div>
            </div>
          )}

          {file && (
            <div className="flex flex-col gap-2 pt-3 border-t border-slate-100">
              {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-2.5 rounded-lg text-xs font-semibold flex items-start gap-2">
                  <X className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              {success && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-2.5 rounded-lg text-xs font-semibold flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span>{success}</span>
                </div>
              )}

              <button
                onClick={handleCompilePdf}
                disabled={selectedPages.length === 0 || isCompiling}
                className={`w-full py-3 rounded-lg font-semibold text-sm text-center flex items-center justify-center gap-2 ${
                  selectedPages.length === 0
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : isCompiling
                    ? 'bg-blue-800 text-white cursor-wait'
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                }`}
                type="button"
              >
                {isCompiling ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Compiling PDF...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Compile Pages ({selectedPages.length})
                  </>
                )}
              </button>

              {compiledPdfUrl && (
                <button
                  onClick={downloadCompiledPdf}
                  className="w-full py-3 rounded-lg font-bold text-sm text-center flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                  type="button"
                >
                  <Download className="w-4 h-4" />
                  Download Rearranged PDF
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tip section */}
        <div className="bg-slate-900 text-slate-100 rounded-xl p-5 border border-slate-800 flex flex-col gap-3 shadow-inner">
          <h4 className="text-xs font-bold font-mono tracking-wider uppercase text-slate-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-blue-400" />
            Rearrange Guidelines
          </h4>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            Drag-and-drop or use the arrow controls on the right panel cards to physically reorder the pages before compiling, or enter custom duplicate index lists (e.g., repeating Page 1 key covers). Everything solves in local browser buffer memory immediately.
          </p>
        </div>
      </div>

      {/* RIGHT COLUMN: Visual Map / Sequence Controller */}
      <div className="lg:col-span-7 flex flex-col gap-6">
        {!file ? (
          <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200 text-center min-h-[450px] shadow-sm">
            <div className="w-14 h-14 bg-slate-50 border border-slate-100 text-slate-400 rounded-lg flex items-center justify-center shadow-inner mb-6">
              <FileText className="w-7 h-7 text-slate-300" />
            </div>
            <h3 className="text-base font-bold text-slate-800 mb-2 font-display">
              Split, Reorder & Duplicate Canvas
            </h3>
            <p className="text-xs text-slate-500 max-w-sm leading-relaxed mb-6">
              Upload a multi-page PDF to view its structure, select specific frames visually, and instantly arrange compiling sequence schedules.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Selected Sequence List */}
            <div 
              onDragOver={handleContainerDragOver}
              onDrop={handleContainerDrop}
              className={`border rounded-xl p-4 flex flex-col gap-3 transition-all duration-200 ${
                draggedSourcePage !== null 
                  ? 'bg-blue-50/70 border-dashed border-blue-400 ring-2 ring-blue-100/50' 
                  : 'bg-slate-100 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Output Compilation Sequence ({selectedPages.length} Pages)
                </h4>
                {draggedSourcePage !== null && (
                  <span className="text-[10px] font-bold text-blue-600 animate-pulse">
                    Drop here to add Page {draggedSourcePage}
                  </span>
                )}
              </div>
              {selectedPages.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 bg-white/50 border border-dashed rounded-lg flex flex-col items-center justify-center gap-2">
                  <span className="font-semibold text-slate-500">Sequence queue empty.</span>
                  <span>Drag and drop pages from below, or click any page to queue them up.</span>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2.5 max-h-[380px] overflow-y-auto p-1">
                  {selectedPages.map((pageNum, idx) => {
                    const isDragged = draggedIndex === idx;
                    const isOver = dragOverIndex === idx;
                    return (
                      <div
                        key={`seq-${pageNum}-${idx}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDragLeave={() => setDragOverIndex(null)}
                        onDragEnd={handleDragEnd}
                        onDrop={(e) => handleDrop(e, idx)}
                        className={`relative w-[110px] h-[146px] bg-white border rounded-lg shadow-xs overflow-hidden group flex-shrink-0 transition-all duration-200 cursor-grab active:cursor-grabbing select-none hover:scale-102 hover:shadow-xs ${
                          isDragged
                            ? 'opacity-30 border-dashed border-blue-400 scale-95 ring-2 ring-blue-100'
                            : isOver
                            ? 'border-blue-500 scale-102 ring-2 ring-blue-200 bg-blue-50/50'
                            : 'border-slate-200 hover:border-blue-500'
                        }`}
                      >
                        {/* High fidelity background page layout */}
                        <div className="w-full h-full p-0.5 bg-white">
                          <PagePreview
                            pageNum={pageNum}
                            pdfDoc={pdfDocument}
                            renderedThumbs={renderedThumbs}
                            onRendered={handlePageRendered}
                            className="w-full h-full object-contain pointer-events-none"
                            minHeight="120px"
                          />
                        </div>

                        {/* Top Left Sequence Number Badge: e.g., OUT #1 */}
                        <div className="absolute top-1 left-1 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm z-20 pointer-events-none select-none tracking-tight">
                          #{idx + 1}
                        </div>

                        {/* Top Right Source Document page badge: e.g., P. 10 */}
                        <div className="absolute top-1 right-1 bg-slate-800/85 text-slate-100 text-[9px] font-semibold px-1 py-0.5 rounded shadow-sm z-20 pointer-events-none select-none">
                          P. {pageNum}
                        </div>

                        {/* Built-in bottom control bar with Chevron actions and close button inside the box */}
                        <div className="absolute bottom-0 inset-x-0 bg-slate-900/90 backdrop-blur-3xs py-1 px-1.5 flex items-center justify-between z-25 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              movePageLeft(idx);
                            }}
                            disabled={idx === 0}
                            title="Move Left"
                            className="p-1 text-slate-300 hover:text-white disabled:opacity-20 rounded hover:bg-white/10 cursor-pointer transition-colors"
                            type="button"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removePageFromSequence(idx);
                            }}
                            title="Remove from target"
                            className="p-1 text-rose-400 hover:text-rose-300 rounded hover:bg-white/10 cursor-pointer transition-colors"
                            type="button"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              movePageRight(idx);
                            }}
                            disabled={idx === selectedPages.length - 1}
                            title="Move Right"
                            className="p-1 text-slate-300 hover:text-white disabled:opacity-20 rounded hover:bg-white/10 cursor-pointer transition-colors"
                            type="button"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Visual Page Selector Grid from source document */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Select Pages from Document ({numPages} Pages)
                </h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const all = Array.from({ length: numPages }, (_, i) => i + 1);
                      setSelectedPages(all);
                      setInputVal(all.join(', '));
                    }}
                    className="text-[10px] bg-slate-100 hover:bg-slate-200 hover:text-slate-850 font-semibold px-2 py-1 rounded cursor-pointer transition-colors"
                    type="button"
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => {
                      setSelectedPages([]);
                      setInputVal('');
                    }}
                    className="text-[10px] bg-rose-50 hover:bg-rose-100 text-rose-600 font-semibold px-2 py-1 rounded cursor-pointer transition-colors"
                    type="button"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="p-16 text-center text-xs text-slate-400 flex flex-col items-center gap-3">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                  <span>Loading document structures...</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-h-[500px] overflow-y-auto pr-1">
                  {Array.from({ length: numPages }).map((_, idx) => {
                    const pageNum = idx + 1;
                    const isSelected = selectedPages.includes(pageNum);
                    return (
                      <div
                        key={`thumb-${pageNum}`}
                        onClick={() => togglePageSelection(pageNum)}
                        draggable
                        onDragStart={(e) => handleSourceDragStart(e, pageNum)}
                        onDragEnd={handleSourceDragEnd}
                        className={`group cursor-grab active:cursor-grabbing relative border rounded-lg overflow-hidden flex flex-col transition-all bg-slate-50 ${
                          isSelected
                            ? 'border-blue-500 ring-2 ring-blue-100 hover:border-blue-600 bg-white'
                            : 'border-slate-200 hover:border-slate-400 hover:bg-slate-100/50'
                        }`}
                        title="Click to select or drag into Output Compilation Sequence above"
                      >
                        {/* High fidelity full-page visual wrapper */}
                        <div className="aspect-[3/4] w-full flex items-center justify-center border-b border-slate-100 bg-white p-1">
                          <PagePreview
                            pageNum={pageNum}
                            pdfDoc={pdfDocument}
                            renderedThumbs={renderedThumbs}
                            onRendered={handlePageRendered}
                            className="w-full h-full object-contain shadow-xs border border-slate-100"
                            minHeight="120px"
                          />
                        </div>

                        {/* Detail footer panel */}
                        <div className="p-2 flex items-center justify-between px-2.5 bg-slate-50/70">
                          <span className="text-[11px] font-bold text-slate-600">
                            Page {pageNum}
                          </span>
                          <div
                            className={`w-4 h-4 rounded-full flex items-center justify-center border text-[9px] font-bold ${
                              isSelected
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'border-slate-300 bg-white text-transparent group-hover:border-slate-400'
                            }`}
                          >
                            ✓
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
