import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';

export default function HelpTooltip({ title, text }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const helpText = typeof text === 'object' ? text.description : text;
  const helpTitle = typeof text === 'object' ? text.title : title;

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative inline-flex items-center ml-1.5 align-middle" ref={containerRef}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        onMouseEnter={() => setIsOpen(true)}
        className="w-4 h-4 rounded-full bg-slate-800 text-indigo-400 hover:bg-indigo-600 hover:text-white border border-indigo-500/30 flex items-center justify-center text-[10px] font-bold transition-all focus:outline-none cursor-pointer shrink-0 shadow-sm"
        title="Нажмите для подсказки"
        aria-label="Подсказка к полю"
      >
        ?
      </button>

      {isOpen && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 sm:w-72 bg-slate-900 border border-indigo-500/40 rounded-xl p-3.5 shadow-2xl z-50 text-slate-200 text-xs font-sans animate-in fade-in duration-150">
          <div className="flex justify-between items-start gap-2 mb-1.5 pb-1 border-b border-slate-800">
            <span className="font-bold text-indigo-400 text-[11px] flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>{helpTitle || 'Подсказка'}</span>
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white text-xs p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-300 whitespace-pre-line font-sans font-normal">
            {helpText}
          </p>
          {/* Arrow */}
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-slate-900"></div>
        </div>
      )}
    </div>
  );
}
