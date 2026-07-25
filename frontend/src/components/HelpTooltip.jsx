import React, { useState, useRef, useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle, X } from 'lucide-react';

export default function HelpTooltip({ tooltipKey, title, text, namespace = 'tooltips' }) {
  const { t, i18n } = useTranslation([namespace, 'common']);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const tooltipId = useId();

  let helpTitle = title;
  let helpText = typeof text === 'object' ? text?.description : text;

  if (tooltipKey) {
    const titleKey = `${tooltipKey}.title`;
    const bodyKey = `${tooltipKey}.body`;
    if (i18n.exists(`${namespace}:${titleKey}`)) {
      helpTitle = t(`${namespace}:${titleKey}`);
    }
    if (i18n.exists(`${namespace}:${bodyKey}`)) {
      helpText = t(`${namespace}:${bodyKey}`);
    }
  }

  const hasText = Boolean(helpTitle || helpText);

  useEffect(() => {
    if (!hasText && tooltipKey && process.env.NODE_ENV === 'development') {
      console.warn(`[HelpTooltip] Tooltip key missing or empty: "${tooltipKey}"`);
    }
  }, [hasText, tooltipKey]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!hasText) {
    return null;
  }

  return (
    <div className="relative inline-flex items-center ml-1.5 align-middle" ref={containerRef}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        onMouseEnter={() => {
          if (window.matchMedia('(hover: hover)').matches) {
            setIsOpen(true);
          }
        }}
        onMouseLeave={() => {
          if (window.matchMedia('(hover: hover)').matches) {
            setIsOpen(false);
          }
        }}
        aria-expanded={isOpen}
        aria-controls={isOpen ? tooltipId : undefined}
        aria-label={t('common:a11y.openHelp', 'Показать подсказку')}
        className="w-4 h-4 rounded-full bg-slate-800 text-indigo-400 hover:bg-indigo-600 hover:text-white border border-indigo-500/30 flex items-center justify-center text-[10px] font-bold transition-all focus:outline-none cursor-pointer shrink-0 shadow-sm"
      >
        ?
      </button>

      {isOpen && (
        <div
          id={tooltipId}
          role="tooltip"
          className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 sm:w-72 bg-slate-900 border border-indigo-500/40 rounded-xl p-3.5 shadow-2xl z-50 text-slate-200 text-xs font-sans animate-in fade-in duration-150"
        >
          <div className="flex justify-between items-start gap-2 mb-1.5 pb-1 border-b border-slate-800">
            <span className="font-bold text-indigo-400 text-[11px] flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>{helpTitle || t('common:a11y.openHelp', 'Подсказка')}</span>
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white text-xs p-0.5 rounded focus:outline-none"
              aria-label={t('common:actions.close', 'Закрыть')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {helpText && (
            <p className="text-[11px] leading-relaxed text-slate-300 whitespace-pre-line font-sans font-normal">
              {helpText}
            </p>
          )}
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-slate-900"></div>
        </div>
      )}
    </div>
  );
}
