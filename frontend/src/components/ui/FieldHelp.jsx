import React, { useState, useRef, useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle, X } from 'lucide-react';

export default function FieldHelp({ tooltipKey, namespace = 'tooltips' }) {
  const { t, i18n } = useTranslation(namespace);
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const tooltipId = useId();

  // Retrieve title and body
  const titleKey = `${tooltipKey}.title`;
  const bodyKey = `${tooltipKey}.body`;

  const titleText = i18n.exists(`${namespace}:${titleKey}`) ? t(titleKey) : null;
  const bodyText = i18n.exists(`${namespace}:${bodyKey}`) ? t(bodyKey) : null;

  const hasText = Boolean(titleText || bodyText);

  // Development warning if key missing
  useEffect(() => {
    if (!hasText && process.env.NODE_ENV === 'development') {
      console.warn(`[FieldHelp] Tooltip key missing or empty for namespace "${namespace}": "${tooltipKey}"`);
    }
  }, [hasText, tooltipKey, namespace]);

  // Handle click outside and Escape key
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    function handleClickOutside(e) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  // If no text exists, hide in production/runtime
  if (!hasText) {
    return null;
  }

  const handleToggle = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setIsOpen((prev) => !prev);
  };

  const handleMouseEnter = () => {
    // Desktop hover trigger
    if (window.matchMedia('(hover: hover)').matches) {
      setIsOpen(true);
    }
  };

  const handleMouseLeave = () => {
    if (window.matchMedia('(hover: hover)').matches) {
      setIsOpen(false);
    }
  };

  return (
    <div
      className="inline-flex items-center relative ml-1.5 align-middle"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-controls={isOpen ? tooltipId : undefined}
        aria-label={t('common:a11y.openHelp', 'Показать подсказку')}
        className="text-slate-400 hover:text-indigo-400 focus:text-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-full p-0.5 transition-colors cursor-pointer"
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          id={tooltipId}
          role="tooltip"
          className="absolute z-50 w-72 max-w-[85vw] p-3 text-sm bg-slate-800 text-slate-100 rounded-lg shadow-xl border border-slate-700 top-full left-1/2 -translate-x-1/2 mt-2 sm:left-auto sm:translate-x-0 sm:right-0 focus:outline-none animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            {titleText && (
              <h4 className="font-semibold text-slate-100 text-sm leading-snug">
                {titleText}
              </h4>
            )}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-slate-200 p-0.5 rounded focus:outline-none"
              aria-label={t('common:actions.close', 'Закрыть')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {bodyText && (
            <p className="text-xs text-slate-300 leading-relaxed break-words whitespace-normal">
              {bodyText}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
