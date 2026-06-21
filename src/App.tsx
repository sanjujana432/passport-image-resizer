/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, DragEvent } from 'react';
import {
  Upload,
  Image as ImageIcon,
  Download,
  RotateCcw,
  RefreshCw,
  FileImage,
  Check,
  AlertCircle,
  HelpCircle,
  Lock,
  Unlock,
  Settings,
  ArrowRight,
  Info,
  Sparkles,
  Trash2,
  CheckCircle2,
  Layers,
  Scale,
  Maximize2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ImageFileState, CompressionSettings, CompressionResult } from './types';
import { loadImage, processImageCompression } from './utils/imageProcess';
import { BeforeAfterSlider } from './components/BeforeAfterSlider';
import { PdfSplitter } from './components/PdfSplitter';
import { PdfConverter } from './components/PdfConverter';
import { PdfMerger } from './components/PdfMerger';

// Dimension Presets
interface DimensionPreset {
  id: string;
  name: string;
  width: number;
  height: number;
  description: string;
}

const DIMENSION_PRESETS: DimensionPreset[] = [
  { id: 'us-passport', name: 'US Passport', width: 600, height: 600, description: '2" x 2" (Passport photo standard)' },
  { id: 'indian-passport', name: 'Indian Visa / Passport', width: 350, height: 350, description: '35mm x 35mm passport' },
  { id: 'resume-headshot', name: 'Resume Headshot', width: 400, height: 500, description: '4:5 modern portrait aspect ratio' },
  { id: 'id-scan', name: 'ID / Aadhaar Scan', width: 1024, height: 650, description: 'Typical landscape card upload size' },
  { id: 'signature', name: 'Signature Scan', width: 300, height: 120, description: '5:2 thumbprint or signature strip' },
  { id: 'square', name: 'Square Profile', width: 1080, height: 1080, description: 'Standard social profile photo' },
  { id: 'full-hd', name: 'Full HD Document', width: 1920, height: 1080, description: 'Clear horizontal certificate scan' },
];

// KB limits presets
const KB_PRESETS = [20, 50, 100, 200, 500];

// Format options
const FORMAT_OPTIONS = [
  { key: 'auto', label: 'Auto (Recommended)', info: 'Keeps format or selects best fit' },
  { key: 'jpeg', label: 'JPEG / JPG', info: 'Best for photographs & scans' },
  { key: 'png', label: 'PNG', info: 'Best for graphics (scales size down)' },
  { key: 'webp', label: 'WebP', info: 'Standard high-efficiency format' },
];

export default function App() {
  // Application State
  const [mainTab, setMainTab] = useState<'image' | 'pdf'>('image');
  const [pdfSubTab, setPdfSubTab] = useState<'split' | 'convert' | 'merge'>('split');
  const [imageState, setImageState] = useState<ImageFileState | null>(null);
  const [settings, setSettings] = useState<CompressionSettings>({
    width: 800,
    height: 600,
    lockAspectRatio: true,
    targetKB: 50,
    outputFormat: 'auto',
  });
  
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [result, setResult] = useState<CompressionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'compare' | 'preview'>('compare');
  const [kbNotification, setKbNotification] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper: Format file bytes into a human readable string
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 1;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Process selected image file
  const handleFile = async (file: File) => {
    if (!file) return;

    // Check if it is a valid image MIME type
    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file (JPEG, PNG, or WebP).');
      return;
    }

    try {
      setError(null);
      setResult(null);
      setKbNotification(null);
      const url = URL.createObjectURL(file);
      const img = await loadImage(url);

      const aspectRatio = img.width / img.height;

      // Update state with newly loaded image details
      const newImageState: ImageFileState = {
        file,
        name: file.name,
        type: file.type,
        size: file.size,
        width: img.width,
        height: img.height,
        aspectRatio,
        previewUrl: url,
      };

      setImageState(newImageState);

      // Set default target dimensions based on original size
      setSettings((prev) => ({
        ...prev,
        width: img.width,
        height: img.height,
      }));

    } catch (err: any) {
      setError(err?.message || 'Failed to open image. Make sure the file is not corrupted.');
    }
  };

  // Manage manual selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  // Drag and Drop Event Handlers
  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  // Remove current image
  const handleClearImage = () => {
    if (imageState?.previewUrl) {
      URL.revokeObjectURL(imageState.previewUrl);
    }
    if (result?.optimizedUrl) {
      URL.revokeObjectURL(result.optimizedUrl);
    }
    setImageState(null);
    setResult(null);
    setError(null);
    setKbNotification(null);
  };

  // Handle Dimension Setting with optional aspect ratio lock
  const handleWidthChange = (val: string) => {
    const w = parseInt(val, 10);
    if (isNaN(w) || w <= 0) {
      setSettings((prev) => ({ ...prev, width: 0 }));
      return;
    }

    setSettings((prev) => {
      const updated = { ...prev, width: w };
      if (prev.lockAspectRatio && imageState?.aspectRatio) {
        updated.height = Math.round(w / imageState.aspectRatio);
      }
      return updated;
    });
  };

  const handleHeightChange = (val: string) => {
    const h = parseInt(val, 10);
    if (isNaN(h) || h <= 0) {
      setSettings((prev) => ({ ...prev, height: 0 }));
      return;
    }

    setSettings((prev) => {
      const updated = { ...prev, height: h };
      if (prev.lockAspectRatio && imageState?.aspectRatio) {
        updated.width = Math.round(h * imageState.aspectRatio);
      }
      return updated;
    });
  };

  // Toggle lock aspect ratio
  const toggleAspectRatio = () => {
    setSettings((prev) => {
      const nextLocked = !prev.lockAspectRatio;
      if (nextLocked && imageState?.aspectRatio) {
        return {
          ...prev,
          lockAspectRatio: nextLocked,
          height: Math.round(prev.width / imageState.aspectRatio),
        };
      }
      return { ...prev, lockAspectRatio: nextLocked };
    });
  };

  // Apply Dimension Presets
  const applyPreset = (preset: DimensionPreset) => {
    setSettings((prev) => ({
      ...prev,
      width: preset.width,
      height: preset.height,
      lockAspectRatio: false, // temporarily unlock so dimensions map identically
    }));
    setKbNotification(`Applied standard preset: ${preset.name} (${preset.width}x${preset.height} px). Aspect ratio lock disabled to fit preset dimensions.`);
  };

  // Apply KB presets
  const applyKbPreset = (kb: number) => {
    setSettings((prev) => ({
      ...prev,
      targetKB: kb,
    }));
  };

  // Execute Resize and Intelligent Compression
  const handleResizeAndCompress = async () => {
    if (!imageState) return;

    if (settings.width <= 0 || settings.height <= 0) {
      setError('Please provide valid width and height dimensions in pixels.');
      return;
    }

    if (settings.targetKB <= 0) {
      setError('Please provide a valid maximum target weight limit in KB.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    // Minor loading illusion to feel stable
    await new Promise((resolve) => setTimeout(resolve, 400));

    try {
      const img = await loadImage(imageState.previewUrl);
      const res = await processImageCompression(
        img,
        settings,
        imageState.name,
        imageState.size
      );

      setResult(res);
      setActiveTab('compare');
    } catch (err: any) {
      setError(err?.message || 'An error occurred while scaling and compressing the image.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Trigger Download of compiled asset
  const handleDownload = () => {
    if (!result || !imageState) return;

    const originalExtension = imageState.name.split('.').pop();
    const originalBaseName = imageState.name.substring(0, imageState.name.lastIndexOf('.'));
    
    // Determine file extension
    let extension = 'jpg';
    if (result.format === 'png') extension = 'png';
    else if (result.format === 'webp') extension = 'webp';

    const filename = `${originalBaseName}_optimized.${extension}`;

    const link = document.createElement('a');
    link.href = result.optimizedUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900 flex flex-col h-full">
      
      {/* Upper Navigation Banner (Professional Polish style) */}
      <header id="app-header" className="sticky top-0 bg-white border-b border-slate-200 z-40 transition-colors">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white shadow-sm">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="text-lg font-bold font-display tracking-tight text-slate-900 leading-none">
                SwiftPress Tool
              </span>
              <span className="hidden sm:inline-block text-[10px] bg-slate-100 text-slate-500 font-bold border border-slate-200 px-1.5 py-0.5 rounded ml-3 font-mono">
                v2.4
              </span>
            </div>
          </div>
          
          <nav className="flex gap-4 sm:gap-6 text-xs sm:text-sm font-medium">
            <button
              onClick={() => setMainTab('image')}
              className={`pb-1 border-b-2 transition-colors cursor-pointer text-xs sm:text-sm ${
                mainTab === 'image'
                  ? 'text-blue-600 font-semibold border-blue-600'
                  : 'text-slate-500 hover:text-slate-800 border-transparent'
              }`}
              type="button"
            >
              Image Resizer
            </button>
            <button
              onClick={() => setMainTab('pdf')}
              className={`pb-1 border-b-2 transition-colors cursor-pointer text-xs sm:text-sm ${
                mainTab === 'pdf'
                  ? 'text-blue-600 font-semibold border-blue-600'
                  : 'text-slate-500 hover:text-slate-800 border-transparent'
              }`}
              type="button"
            >
              PDF Utilities
            </button>
          </nav>
        </div>
      </header>

      {/* Main Structural Body */}
      <main id="app-main-workspace" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6">
        
        {mainTab === 'image' ? (
          <>
            {/* Image Header */}
            <div className="max-w-3xl">
              <h2 className="text-3xl font-extrabold font-display tracking-tight text-slate-900 md:text-4xl text-pretty">
                Image Resizer & Compressor
              </h2>
              <p className="mt-2 text-slate-600 leading-relaxed text-sm text-pretty">
                Easily optimize, resize, and compress your photographs to target-specific pixel dimensions and maximum file size limits in KB. All processing occurs locally in your browser sandbox.
              </p>
            </div>

            {/* Outer 2-Column Responsive Workspace Grid (Sidebar w-80 style matched inside layout) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT COLUMN: Controls Sidebar (lg:col-span-5) */}
          <div id="controls-workspace" className="lg:col-span-5 flex flex-col gap-5">
            
            {/* Cards layout */}
            <div id="controls-card" className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-5">
              
              {/* STEP 1: Upload Workspace */}
              <div id="section-image-upload" className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    1. Upload Image
                  </h2>
                  {imageState && (
                    <button
                      id="clear-photo-btn"
                      onClick={handleClearImage}
                      className="text-[11px] text-rose-500 hover:text-rose-600 font-semibold flex items-center gap-1 transition-colors group"
                      type="button"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear Current
                    </button>
                  )}
                </div>

                <AnimatePresence mode="wait">
                  {!imageState ? (
                    /* Elegant Drag and Drop container with matching Polish style values */
                    <motion.div
                      key="drop-active"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      onDragEnter={handleDragEnter}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={triggerFileSelect}
                      id="upload-dropzone"
                      className={`relative border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors duration-250 select-none ${
                        isDragging
                          ? 'border-blue-500 bg-blue-50/50'
                          : 'border-slate-200 hover:bg-slate-50 bg-slate-50/50'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileChange}
                        accept="image/png, image/jpeg, image/jpg, image/webp"
                        className="hidden"
                        id="image-file-input"
                      />

                      <Upload className="w-10 h-10 text-slate-300 mb-2" />
                      <span className="text-xs font-semibold text-slate-600 text-center">
                        Drop file here or <span className="text-blue-600 underline hover:text-blue-700">click to browse</span>
                      </span>
                      <span className="text-[10px] text-slate-400 mt-1">
                        Supports JPG, PNG, WebP up to 20MB
                      </span>
                    </motion.div>
                  ) : (
                    /* Active status pill */
                    <motion.div
                      key="uploaded-compact"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="border border-slate-200 bg-slate-50/50 rounded-lg p-3.5 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative w-12 h-12 bg-slate-900 rounded overflow-hidden flex-shrink-0 border border-slate-200">
                          <img
                            src={imageState.previewUrl}
                            alt="Uploaded preview"
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="min-w-0 flex flex-col">
                          <h4 className="text-xs font-semibold text-slate-800 truncate max-w-[150px] sm:max-w-[200px]">
                            {imageState.name}
                          </h4>
                          <span className="text-[10px] font-mono text-slate-400 mt-0.5">
                            Original: {formatBytes(imageState.size)} • {imageState.width}x{imageState.height}px
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center bg-blue-50 text-blue-700 border border-blue-200/50 rounded-full px-2 py-0.5 text-[9px] font-mono font-bold leading-normal flex-shrink-0">
                        SUCCESSFULLY LOADED
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* STEP 2: Dimensions Setting */}
              <div id="section-dimensions-settings" className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    2. Dimensions (px)
                  </h2>
                </div>

                {/* Width & Height inputs */}
                <div className="grid grid-cols-11 gap-3 items-center">
                  
                  {/* Width input */}
                  <div className="col-span-5 flex flex-col gap-1">
                    <label htmlFor="input-target-width" className="text-[10px] text-slate-500">
                      Width
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        id="input-target-width"
                        min="10"
                        max="8000"
                        value={settings.width || ''}
                        onChange={(e) => handleWidthChange(e.target.value)}
                        disabled={!imageState}
                        className="w-full text-sm border border-slate-200 rounded px-3 py-2 bg-slate-50 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none font-mono font-semibold text-slate-800 disabled:opacity-50"
                        placeholder="e.g. 1200"
                      />
                    </div>
                  </div>

                  {/* Lock ratio toggler */}
                  <div className="col-span-1 flex justify-center pt-5">
                    <button
                      id="aspect-ratio-lock-btn"
                      onClick={toggleAspectRatio}
                      disabled={!imageState}
                      title={settings.lockAspectRatio ? "Maintain aspect ratio enabled" : "Aspect ratio unlocked"}
                      className={`p-2 rounded transition-colors ${
                        settings.lockAspectRatio
                          ? 'bg-blue-50 text-blue-600 hover:bg-blue-100/80 border border-blue-100'
                          : 'bg-slate-50 text-slate-400 hover:bg-slate-100 border border-slate-200'
                      } disabled:opacity-50`}
                      type="button"
                    >
                      {settings.lockAspectRatio ? (
                        <Lock className="w-3.5 h-3.5" />
                      ) : (
                        <Unlock className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Height input */}
                  <div className="col-span-5 flex flex-col gap-1">
                    <label htmlFor="input-target-height" className="text-[10px] text-slate-500">
                      Height
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        id="input-target-height"
                        min="10"
                        max="8000"
                        value={settings.height || ''}
                        onChange={(e) => handleHeightChange(e.target.value)}
                        disabled={!imageState}
                        className="w-full text-sm border border-slate-200 rounded px-3 py-2 bg-slate-50 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none font-mono font-semibold text-slate-800 disabled:opacity-50"
                        placeholder="e.g. 800"
                      />
                    </div>
                  </div>

                </div>

                {/* Presets pills wrapper */}
                <div id="dimensions-presets-wrapper" className="mt-1 flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold font-mono text-slate-400 uppercase">
                    Common Portal Dimensions:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {DIMENSION_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        id={`preset-dim-${p.id}`}
                        onClick={() => applyPreset(p)}
                        type="button"
                        disabled={!imageState}
                        title={p.description}
                        className="text-[11px] font-medium bg-slate-50 hover:bg-blue-50 hover:text-blue-600 border border-slate-200/80 hover:border-blue-200 px-2.5 py-1 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {/* STEP 3: Quality target constraints */}
              <div id="section-compression-settings" className="flex flex-col gap-3 pt-1 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    3. Target Size (KB)
                  </h2>
                </div>

                {/* Target size numeric input */}
                <div className="relative">
                  <input
                    type="number"
                    id="input-target-kb"
                    min="1"
                    max="20000"
                    value={settings.targetKB || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setSettings((prev) => ({ ...prev, targetKB: isNaN(val) ? 0 : val }));
                    }}
                    disabled={!imageState}
                    className="w-full text-sm font-semibold border border-blue-200 rounded px-3 py-2.5 bg-blue-50 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none text-blue-700 disabled:opacity-50"
                    placeholder="e.g. 50"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-blue-400">
                    KB
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  System automatically adjusts JPEG/WebP quality factor behind the scenes to strictly stay under this limit.
                </p>

                {/* KB Presets */}
                <div id="size-presets-wrapper" className="flex flex-col gap-1.5 mt-0.5">
                  <div className="flex flex-wrap gap-1">
                    {KB_PRESETS.map((kb) => (
                      <button
                        key={kb}
                        id={`preset-kb-${kb}`}
                        onClick={() => applyKbPreset(kb)}
                        type="button"
                        disabled={!imageState}
                        className={`text-[11px] font-mono border px-2.5 py-1 rounded transition-colors font-semibold ${
                          settings.targetKB === kb
                            ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                            : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100 text-slate-600'
                        } disabled:opacity-40`}
                      >
                        {kb} KB
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {/* STEP 4: Choose Format option */}
              <div id="section-format-selection" className="flex flex-col gap-3 pt-1 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    4. Choose Format
                  </h2>
                </div>

                {/* Formats picker */}
                <div className="grid grid-cols-2 gap-2">
                  {FORMAT_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      id={`format-${opt.key}`}
                      onClick={() => setSettings((prev) => ({ ...prev, outputFormat: opt.key as any }))}
                      disabled={!imageState}
                      type="button"
                      className={`text-left p-2 border rounded-lg flex flex-col transition-all cursor-pointer ${
                        settings.outputFormat === opt.key
                          ? 'bg-blue-50 border-blue-500 text-blue-900 shadow-xs'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                      } disabled:opacity-40`}
                    >
                      <span className="text-xs font-bold leading-normal">
                        {opt.label}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate mt-0.5 max-w-full">
                        {opt.info}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* MAIN Actions and trigger buttons */}
              <div id="section-action-triggers" className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                
                {/* Warnings */}
                {error && (
                  <div id="error-banner" className="bg-rose-50 border border-rose-200/60 text-rose-800 p-2.5 rounded-lg flex items-start gap-2 text-xs">
                    <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                    <div className="font-semibold">{error}</div>
                  </div>
                )}

                {kbNotification && (
                  <div id="preset-applied-banner" className="bg-amber-50 border border-amber-200/65 text-amber-800 p-2.5 rounded-lg flex items-start gap-2 text-xs">
                    <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="font-medium">{kbNotification}</div>
                  </div>
                )}

                <button
                  id="compress-action-btn"
                  onClick={handleResizeAndCompress}
                  disabled={!imageState || isProcessing}
                  className={`w-full py-3 px-6 rounded-lg font-semibold text-sm transition-all text-center flex items-center justify-center gap-2 ${
                    !imageState
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : isProcessing
                      ? 'bg-blue-800 text-white cursor-wait'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow active:scale-[0.98]'
                  }`}
                  type="button"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Optimizing and Resizing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Resize & Compress
                    </>
                  )}
                </button>

                {/* Secondary Download Button always visible but conditionally disabled */}
                {!result ? (
                  <button
                    disabled
                    className="w-full bg-slate-100 text-slate-400 font-semibold py-3 rounded-lg text-sm cursor-not-allowed"
                    type="button"
                  >
                    Download Optimized Image
                  </button>
                ) : (
                  <button
                    id="download-optimized-btn"
                    onClick={handleDownload}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg text-sm shadow-sm flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
                    type="button"
                  >
                    <Download className="w-4 h-4" />
                    Download Optimized Image
                  </button>
                )}
              </div>

            </div> {/* /card */}

          </div> {/* /left-column */}


          {/* RIGHT COLUMN: Preview Panel (lg:col-span-7 style matched inside layout) */}
          <div id="workspace-preview-panel" className="lg:col-span-7 flex flex-col gap-6">
            
            {/* If no selected image */}
            {!imageState ? (
              <div id="preview-empty-state" className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200 text-center min-h-[500px] shadow-sm">
                <div className="w-14 h-14 bg-slate-50 border border-slate-100 text-slate-400 rounded-lg flex items-center justify-center shadow-inner mb-6">
                  <ImageIcon className="w-7 h-7 text-slate-300" />
                </div>
                <h3 className="text-base font-bold text-slate-800 mb-2 font-display">
                  Live Preview Area
                </h3>
                <p className="text-xs text-slate-500 max-w-sm leading-relaxed mb-6">
                  Select, drag, or paste a photo into Step 1 to explore instant dimensions matching and target KB weight compression stats.
                </p>

                {/* Horizontal Features highlights */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg text-left mt-4 border-t border-slate-100 pt-6">
                  <div className="p-3 bg-slate-50 border border-slate-200/50 rounded-lg">
                    <span className="block font-bold text-xs text-slate-800 mb-0.5">🔒 Local Sandbox</span>
                    <span className="text-[10px] text-slate-400 leading-normal">Runs 100% locally. Safe for highly confidential files.</span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200/50 rounded-lg">
                    <span className="block font-bold text-xs text-slate-800 mb-0.5">⚡ Auto Weight</span>
                    <span className="text-[10px] text-slate-400 leading-normal">Intelligently optimizes quality factor to meet size limitations.</span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200/50 rounded-lg">
                    <span className="block font-bold text-xs text-slate-800 mb-0.5">📐 Height Guard</span>
                    <span className="text-[10px] text-slate-400 leading-normal">Locks aspects automatically to avoid warped dimensions.</span>
                  </div>
                </div>
              </div>
            ) : (
              /* If loaded and displayed representing Poland Theme precisely */
              <div id="preview-workspace" className="flex flex-col gap-4">
                
                {/* Result header navigation and toggle options */}
                <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
                  <div>
                    <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5 font-display">
                      <ImageIcon className="w-4 h-4 text-slate-500" />
                      Live Preview & Comparison
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {result ? 'Configure slider tab comparisons or inspect stats.' : 'Adjust settings and click Resize & Compress to compute results.'}
                    </p>
                  </div>
                  
                  {result && (
                    <div className="flex bg-slate-100 p-1 rounded border border-slate-200/50">
                      <button
                        id="tab-toggle-compare"
                        onClick={() => setActiveTab('compare')}
                        className={`px-3 py-1 text-[11px] font-bold rounded-l transition-all ${
                          activeTab === 'compare'
                            ? 'bg-white text-slate-700 shadow-xs'
                            : 'text-slate-400 hover:text-slate-600'
                        }`}
                        type="button"
                      >
                        Slider Compare
                      </button>
                      <button
                        id="tab-toggle-preview"
                        onClick={() => setActiveTab('preview')}
                        className={`px-3 py-1 text-[11px] font-bold rounded-r transition-all ${
                          activeTab === 'preview'
                            ? 'bg-white text-slate-700 shadow-xs'
                            : 'text-slate-400 hover:text-slate-600'
                        }`}
                        type="button"
                      >
                        Optimized View
                      </button>
                    </div>
                  )}
                </div>

                {/* Display Area Content Box with Before/After comparison blocks */}
                <div id="comparison-display-box" className="bg-slate-200/50 border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center relative min-h-[350px]">
                  
                  {!result ? (
                    /* Shows Original preview side with badge layout matching SwiftPress Tool theme closely */
                    <div className="w-full relative flex flex-col items-center gap-4">
                      <div className="absolute top-4 left-4 z-10 bg-black/60 text-white text-[10px] font-bold px-2.5 py-1 rounded backdrop-blur-md">
                        ORIGINAL: {formatBytes(imageState.size)}
                      </div>
                      
                      <div className="w-full max-h-[380px] bg-white border border-slate-200 rounded p-4 flex items-center justify-center overflow-hidden">
                        <img
                          src={imageState.previewUrl}
                          alt="Original file"
                          className="max-h-[300px] object-contain rounded bg-slate-50 p-2 border border-slate-100"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      
                      <div className="w-full text-center">
                        <p className="text-xs font-bold text-slate-600 leading-none truncate max-w-sm mx-auto">{imageState.name}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{imageState.width} x {imageState.height} pixels • Original raw</p>
                      </div>

                      {/* Guidance runner */}
                      <button
                        id="instant-optimizer-run-btn"
                        onClick={handleResizeAndCompress}
                        className="mt-2 bg-blue-600 hover:bg-blue-700 text-white text-xs px-5 py-2.5 rounded-lg font-bold transition-all shadow-sm flex items-center gap-1.5"
                        type="button"
                      >
                        Resize & Compress
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    /* Display of results */
                    <div className="w-full flex-1 flex flex-col gap-4">
                      {activeTab === 'compare' ? (
                        <div className="relative">
                          <BeforeAfterSlider
                            originalUrl={imageState.previewUrl}
                            optimizedUrl={result.optimizedUrl}
                          />
                        </div>
                      ) : (
                        <div className="w-full h-[320px] sm:h-[400px] md:h-[430px] bg-slate-900 rounded-xl overflow-hidden relative border border-slate-200 p-2 flex items-center justify-center shadow-lg">
                          <img
                            src={result.optimizedUrl}
                            alt="Optimized output"
                            className="w-full h-full object-contain"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute top-4 left-4 bg-emerald-600 text-white font-mono text-xs px-2.5 py-1 rounded font-bold shadow-sm">
                            OPTIMIZED: {formatBytes(result.size)}
                          </div>
                          <button
                            id="zoom-original-preview"
                            onClick={() => window.open(result.optimizedUrl, '_blank')}
                            className="absolute bottom-4 right-4 bg-slate-950/75 p-2 rounded text-slate-300 hover:text-white transition-all text-[11px] flex items-center gap-1"
                            type="button"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                            Open Full Size
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* STATS BOARD: Telemetry in blue / green bento cards style representer */}
                {result && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    id="telemetry-stats-bento"
                    className="grid grid-cols-2 md:grid-cols-4 gap-4"
                  >
                    
                    {/* Weight reduction status card */}
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-900 border border-blue-100 p-4 rounded-xl flex flex-col shadow-xs">
                      <span className="text-[10px] font-bold font-mono text-blue-600 tracking-wider uppercase">
                        Saved Space
                      </span>
                      <span className="text-2xl font-extrabold font-display text-blue-800 leading-tight mt-1">
                        {result.percentageReduced}%
                      </span>
                      <span className="text-[10px] text-blue-600/80 mt-1 font-medium truncate">
                        Reduced {formatBytes(imageState.size - result.size)}
                      </span>
                    </div>

                    {/* Compliant with limit check card */}
                    <div className="bg-white border border-slate-200 p-4 rounded-xl flex flex-col shadow-xs">
                      <span className="text-[10px] font-bold font-mono text-emerald-600 tracking-wider uppercase flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        Target Fit
                      </span>
                      <span className="text-base font-extrabold text-slate-900 leading-tight mt-1.5 flex items-baseline gap-1">
                        {formatBytes(result.size)}
                      </span>
                      <span className="text-[10px] text-slate-400 mt-1 font-medium truncate">
                        Ceiling: {settings.targetKB}KB
                      </span>
                    </div>

                    {/* Applied size resolution scale card */}
                    <div className="bg-white border border-slate-200 p-4 rounded-xl flex flex-col shadow-xs">
                      <span className="text-[10px] font-bold font-mono text-slate-400 tracking-wider uppercase">
                        Resolution
                      </span>
                      <span className="text-sm font-extrabold text-slate-900 leading-tight mt-1.5 truncate">
                        {result.width} × {result.height}
                      </span>
                      <span className="text-[10px] text-slate-500 mt-1 leading-normal truncate">
                        {result.scaleApplied < 1.0 
                          ? `Dimension Scale: ${Math.round(result.scaleApplied * 100)}%`
                          : 'Dimensions locked'
                        }
                      </span>
                    </div>

                    {/* Applied quality factor and output mimetype card */}
                    <div className="bg-white border border-slate-200 p-4 rounded-xl flex flex-col shadow-xs">
                      <span className="text-[10px] font-bold font-mono text-slate-400 tracking-wider uppercase">
                        Format / Quality
                      </span>
                      <span className="text-sm font-extrabold text-slate-900 mt-1.5 uppercase flex items-center gap-1.5">
                        {result.format}
                        <span className="text-[9px] normal-case bg-slate-100 text-slate-600 px-1 py-0.5 rounded font-mono">
                          Q:{Math.round(result.quality * 100)}%
                        </span>
                      </span>
                      <span className="text-[10px] text-slate-400 mt-1 select-none font-medium truncate">
                        Auto-Regulated
                      </span>
                    </div>

                  </motion.div>
                )}

                {/* Secure certificate compliant banner shown if compressed successfully */}
                <div className="p-4 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center gap-2 shadow-xs">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="text-[11px] font-medium text-slate-600 italic">
                    “Compliant for: Department of State Upload Tool • CV Submissions • Passport & Visa Portals”
                  </span>
                </div>

              </div>
            )}



          </div> {/* /right-column */}

        </div> {/* /grid */}
          </>
        ) : (
          <>
            {/* PDF HEADER */}
            <div className="max-w-3xl">
              <h2 className="text-3xl font-extrabold font-display tracking-tight text-slate-900 md:text-4xl text-pretty">
                Advanced PDF Utilities
              </h2>
              <p className="mt-2 text-slate-600 leading-relaxed text-sm text-pretty">
                Split, reorder, merge, or convert files directly in your browser. All computations are calculated locally utilizing secure client sandbox processes, ensuring absolute safety.
              </p>
            </div>

            {/* PDF TAB SELECTOR */}
            <div className="flex border-b border-slate-200 gap-2 sm:gap-4 text-xs sm:text-sm font-semibold text-slate-400">
              <button
                onClick={() => setPdfSubTab('split')}
                className={`pb-3 border-b-2 transition-all cursor-pointer ${
                  pdfSubTab === 'split' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent hover:text-slate-700'
                }`}
                type="button"
              >
                1. Split & Reorder Pages
              </button>
              <button
                onClick={() => setPdfSubTab('convert')}
                className={`pb-3 border-b-2 transition-all cursor-pointer ${
                  pdfSubTab === 'convert' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent hover:text-slate-700'
                }`}
                type="button"
              >
                2. Document Converter
              </button>
              <button
                onClick={() => setPdfSubTab('merge')}
                className={`pb-3 border-b-2 transition-all cursor-pointer ${
                  pdfSubTab === 'merge' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent hover:text-slate-700'
                }`}
                type="button"
              >
                3. PDF Merge Tool
              </button>
            </div>

            {/* Render PDF sub-panels */}
            <div className="flex flex-col gap-6">
              {pdfSubTab === 'split' && <PdfSplitter />}
              {pdfSubTab === 'convert' && <PdfConverter />}
              {pdfSubTab === 'merge' && <PdfMerger />}
            </div>
          </>
        )}

      </main>

      {/* Polish style Footer */}
      <footer id="app-footer" className="mt-auto h-12 border-t border-slate-200 bg-white flex items-center justify-between px-6 sm:px-8 text-[10px] text-slate-400 select-none">
        <div>Engine: SmartRecalibrate v2.4</div>
        <div className="hidden sm:flex gap-4">
          <span>Session ID: 48A-92L</span>
          <span>Status: Ready to Process</span>
        </div>
        <div>Terms • Privacy • Cookie Policy</div>
      </footer>

    </div>
  );
}
