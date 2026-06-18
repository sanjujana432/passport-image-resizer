import React, { useState, useRef, useEffect } from 'react';

interface BeforeAfterSliderProps {
  originalUrl: string;
  optimizedUrl: string;
}

export const BeforeAfterSlider: React.FC<BeforeAfterSliderProps> = ({
  originalUrl,
  optimizedUrl,
}) => {
  const [sliderPosition, setSliderPosition] = useState<number>(50);
  const [containerWidth, setContainerWidth] = useState<number>(500);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use ResizeObserver to keep the inner optimized image matching the parent container's width exactly
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      id="before-after-container"
      className="relative w-full h-[320px] sm:h-[400px] md:h-[450px] bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 shadow-inner select-none"
    >
      {/* Original Image (Base Layer - Left side) */}
      <img
        src={originalUrl}
        alt="Original Image"
        className="absolute top-0 left-0 w-full h-full object-contain pointer-events-none p-2 bg-slate-900"
        referrerPolicy="no-referrer"
      />
      <div className="absolute top-4 left-4 bg-slate-950/75 backdrop-blur-md text-white border border-slate-800 text-xs px-3 py-1.5 rounded-full font-mono font-medium z-10">
        Original
      </div>

      {/* Optimized Image (Overlapping Layer - Right side, clipped by sliderPosition) */}
      <div
        className="absolute top-0 left-0 h-full overflow-hidden pointer-events-none"
        style={{ width: `${sliderPosition}%` }}
      >
        <div
          className="absolute top-0 left-0 h-full bg-slate-900"
          style={{ width: `${containerWidth}px` }}
        >
          <img
            src={optimizedUrl}
            alt="Optimized Image"
            className="w-full h-full object-contain pointer-events-none p-2 bg-slate-900"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>
      <div className="absolute top-4 right-4 bg-teal-500/85 backdrop-blur-md text-white border border-teal-400/30 text-xs px-3 py-1.5 rounded-full font-mono font-medium z-10">
        Optimized
      </div>

      {/* Slider Dragger handle */}
      <div
        id="slider-divider"
        className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize z-20 pointer-events-none shadow-[0_0_10px_rgba(0,0,0,0.5)]"
        style={{ left: `${sliderPosition}%` }}
      >
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-9 bg-white border-2 border-teal-500 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95">
          <div className="flex items-center gap-[3px] text-teal-600 font-bold select-none text-xs">
            <span>◀</span>
            <span>▶</span>
          </div>
        </div>
      </div>

      {/* Transparent Input Range Overlay to capture click-and-drags natively */}
      <input
        type="range"
        min="0"
        max="100"
        value={sliderPosition}
        onChange={(e) => setSliderPosition(Number(e.target.value))}
        id="slider-range-input"
        className="absolute top-0 left-0 w-full h-full cursor-ew-resize opacity-0 z-30 m-0"
        aria-label="Drag to compare original and optimized images"
      />
    </div>
  );
};
