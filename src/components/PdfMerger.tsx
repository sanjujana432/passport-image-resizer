import React, { useState, useRef } from 'react';
import { Upload, Trash2, ArrowUp, ArrowDown, FileText, Check, Sparkles, X, RefreshCw, Download, Layers } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';

interface MergeFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
}

export function PdfMerger() {
  const [files, setFiles] = useState<MergeFileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mergedPdfUrl, setMergedPdfUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse bytes formats
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Upload changes
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newItems: MergeFileItem[] = [];
      for (let i = 0; i < e.target.files.length; i++) {
        const f = e.target.files[i];
        if (f.type === 'application/pdf' || f.name.endsWith('.pdf')) {
          newItems.push({
            id: `${Date.now()}-${i}-${Math.random().toString(36).substr(2, 4)}`,
            file: f,
            name: f.name,
            size: f.size,
          });
        }
      }
      if (newItems.length === 0) {
        setError('Please choose valid PDF files.');
        return;
      }
      setFiles((prev) => [...prev, ...newItems]);
      setMergedPdfUrl(null);
      setError(null);
      setSuccess(null);
    }
  };

  // Move element up in sequence
  const moveUp = (index: number) => {
    if (index === 0) return;
    setFiles((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[index - 1];
      next[index - 1] = temp;
      return next;
    });
    setMergedPdfUrl(null);
  };

  // Move element down in sequence
  const moveDown = (index: number) => {
    if (index >= files.length - 1) return;
    setFiles((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[index + 1];
      next[index + 1] = temp;
      return next;
    });
    setMergedPdfUrl(null);
  };

  // Delete element from list
  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((item) => item.id !== id));
    setMergedPdfUrl(null);
    setSuccess(null);
  };

  // Clear all files
  const clearAll = () => {
    setFiles([]);
    setMergedPdfUrl(null);
    setError(null);
    setSuccess(null);
  };

  // Merge PDFs
  const handleMergePdf = async () => {
    if (files.length < 2) {
      setError('Please upload at least 2 separate PDF files to merge.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    setMergedPdfUrl(null);

    try {
      const mergedPdf = await PDFDocument.create();

      for (const item of files) {
        const fileBuffer = await item.file.arrayBuffer();
        const srcDoc = await PDFDocument.load(fileBuffer);
        const indices = srcDoc.getPageIndices();
        const copiedPages = await mergedPdf.copyPages(srcDoc, indices);
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const mergedBytes = await mergedPdf.save();
      const blob = new Blob([mergedBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setMergedPdfUrl(url);
      setSuccess(`Successfully merged ${files.length} PDF files into a single master document!`);
    } catch (err: any) {
      console.error(err);
      setError('Failed to merge documents: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Trigger download
  const downloadMergedPdf = () => {
    if (!mergedPdfUrl) return;
    const link = document.createElement('a');
    link.href = mergedPdfUrl;
    link.download = `swift_files_merged.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* LEFT COLUMN: Setup Upload & Actions */}
      <div className="lg:col-span-5 flex flex-col gap-5">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              1. Add PDF Files
            </h3>
            {files.length > 0 && (
              <button
                onClick={clearAll}
                className="text-[11px] text-rose-500 hover:text-rose-600 font-semibold flex items-center gap-1 transition-colors"
                type="button"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear All
              </button>
            )}
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="relative border-2 border-dashed border-slate-200 hover:bg-slate-50 p-6 rounded-lg text-center cursor-pointer transition-colors"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="application/pdf"
              multiple
              className="hidden"
            />
            <Upload className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <span className="block text-xs font-semibold text-slate-600">
              Select local files to merge or <span className="text-blue-600 underline">browse</span>
            </span>
            <span className="block text-[10px] text-slate-400 mt-1">
              Supports multiple uploads simultaneously
            </span>
          </div>

          {files.length > 0 && (
            <div className="flex flex-col gap-2 pt-3 border-t border-slate-100">
              {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-2.5 rounded text-xs font-semibold">
                  {error}
                </div>
              )}
              {success && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-2.5 rounded text-xs font-semibold">
                  {success}
                </div>
              )}

              <button
                onClick={handleMergePdf}
                disabled={files.length < 2 || isProcessing}
                className={`w-full py-3 rounded-lg font-semibold text-sm text-center flex items-center justify-center gap-2 ${
                  files.length < 2
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : isProcessing
                    ? 'bg-blue-800 text-white cursor-wait'
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                }`}
                type="button"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Merging PDF documents...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Merge {files.length} PDFs
                  </>
                )}
              </button>

              {mergedPdfUrl && (
                <button
                  onClick={downloadMergedPdf}
                  className="w-full py-3 rounded-lg font-bold text-sm text-center flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                  type="button"
                >
                  <Download className="w-4 h-4" />
                  Download Merged Outcome
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Sequence Manager */}
      <div className="lg:col-span-7">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4 shadow-sm min-h-[380px]">
          <div className="border-b border-slate-100 pb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Merge Sequence Queue ({files.length} files)
            </h4>
            <p className="text-[11px] text-slate-400 mt-1">
              File blocks combine top-to-bottom. Relocate elements using the Up/Down keys.
            </p>
          </div>

          {files.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 p-12">
              <Layers className="w-10 h-10 text-slate-300 mb-3" />
              <h5 className="text-xs font-bold text-slate-700">Merge list has no elements</h5>
              <p className="text-[11px] text-slate-400 mt-0.5">Please add files on the left menu block to start your layout flow.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto pr-1">
              {files.map((item, idx) => (
                <div
                  key={item.id}
                  className="border border-slate-200 rounded-lg p-3 bg-slate-50 flex items-center justify-between gap-4 shadow-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 bg-red-50 text-red-600 rounded border border-red-100 flex items-center justify-center flex-shrink-0 text-xs font-bold">
                      #{idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block text-xs font-bold text-slate-800 truncate" title={item.name}>
                        {item.name}
                      </span>
                      <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
                        {formatBytes(item.size)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => moveUp(idx)}
                      disabled={idx === 0}
                      title="Move Up"
                      className="p-1 px-2 text-xs bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 border rounded flex items-center gap-1 font-semibold"
                      type="button"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => moveDown(idx)}
                      disabled={idx === files.length - 1}
                      title="Move Down"
                      className="p-1 px-2 text-xs bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 border rounded flex items-center gap-1 font-semibold"
                      type="button"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => removeFile(item.id)}
                      title="Delete"
                      className="p-1.5 text-rose-500 hover:text-rose-600 rounded bg-white border border-slate-200 hover:bg-rose-50"
                      type="button"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
