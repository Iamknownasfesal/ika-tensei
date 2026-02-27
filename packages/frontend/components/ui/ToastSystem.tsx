"use client";

import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================================
// TYPES
// ============================================================================

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextType {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

// ============================================================================
// CONTEXT
// ============================================================================

const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

// ============================================================================
// ANIMATION KEYFRAMES
// ============================================================================

const toastKeyframes = `
  @keyframes toast-slide-in {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes toast-fade-out {
    from { opacity: 1; }
    to { opacity: 0; }
  }
`;

// ============================================================================
// PIXEL ICONS (8x8 SVG icons)
// ============================================================================

const CheckIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    width="8"
    height="8"
    viewBox="0 0 8 8"
    fill="none"
    className={className}
  >
    <path
      d="M1 4L3 6L7 2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const XIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    width="8"
    height="8"
    viewBox="0 0 8 8"
    fill="none"
    className={className}
  >
    <path
      d="M1 1L7 7M7 1L1 7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const ExclamationIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    width="8"
    height="8"
    viewBox="0 0 8 8"
    fill="none"
    className={className}
  >
    <path
      d="M4 1L4 5M4 7V7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ScrollIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    width="8"
    height="8"
    viewBox="0 0 8 8"
    fill="none"
    className={className}
  >
    <path
      d="M2 1H6V7H2V1Z"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M3 3H5M3 4H5M3 5H4"
      stroke="currentColor"
      strokeWidth="0.5"
      strokeLinecap="round"
    />
  </svg>
);

// ============================================================================
// TOAST CONFIGURATION
// ============================================================================

const TOAST_CONFIG: Record<ToastType, {
  icon: React.ReactNode;
  borderColor: string;
  bgColor: string;
  textColor: string;
  glowColor: string;
  title: string;
}> = {
  success: {
    icon: <CheckIcon className="text-spectral-green" />,
    borderColor: 'border-spectral-green',
    bgColor: 'bg-ritual-dark',
    textColor: 'text-ghost-white',
    glowColor: 'shadow-spectral-green/50',
    title: 'Success',
  },
  error: {
    icon: <XIcon className="text-demon-red" />,
    borderColor: 'border-demon-red',
    bgColor: 'bg-ritual-dark',
    textColor: 'text-ghost-white',
    glowColor: 'shadow-demon-red/50',
    title: 'Error',
  },
  warning: {
    icon: <ExclamationIcon className="text-ritual-gold" />,
    borderColor: 'border-ritual-gold',
    bgColor: 'bg-ritual-dark',
    textColor: 'text-ghost-white',
    glowColor: 'shadow-ritual-gold/50',
    title: 'Warning',
  },
  info: {
    icon: <ScrollIcon className="text-soul-cyan" />,
    borderColor: 'border-soul-cyan',
    bgColor: 'bg-ritual-dark',
    textColor: 'text-ghost-white',
    glowColor: 'shadow-soul-cyan/50',
    title: 'Info',
  },
};

// ============================================================================
// TOAST ITEM COMPONENT
// ============================================================================

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onRemove }) => {
  const config = TOAST_CONFIG[toast.type];
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const duration = toast.duration || 4000;
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onRemove(toast.id), 300);
    }, duration - 300);
    return () => clearTimeout(timer);
  }, [toast, onRemove]);

  const handleClick = () => {
    setIsExiting(true);
    setTimeout(() => onRemove(toast.id), 300);
  };

  return (
    <motion.div
      initial={{ x: 100, opacity: 0 }}
      animate={{ x: isExiting ? 100 : 0, opacity: isExiting ? 0 : 1 }}
      exit={{ x: 100, opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      onClick={handleClick}
      className={`
        ${config.bgColor} ${config.borderColor} border-2
        relative cursor-pointer select-none
        min-w-[280px] max-w-sm
        font-silk text-sm
      `}
      style={{
        boxShadow: `
          inset 0 0 0 1px rgba(255,255,255,0.1),
          0 0 15px rgba(0,0,0,0.5),
          0 4px 20px ${config.glowColor}
        `,
      }}
    >
      {/* Double border effect - outer */}
      <div className="absolute inset-0 border-2 border-sigil-border pointer-events-none opacity-50" />
      
      {/* Inner content */}
      <div className="relative p-3 pl-4 flex items-center gap-3">
        {/* Icon */}
        <div className={`flex-shrink-0 w-5 h-5 flex items-center justify-center ${config.borderColor}`}>
          {config.icon}
        </div>
        
        {/* Message */}
        <p className={`${config.textColor} flex-1 leading-relaxed`}>
          {toast.message}
        </p>
        
        {/* Close indicator */}
        <div className="flex-shrink-0 text-ghost-white/40 text-xs">
          ✕
        </div>
      </div>
    </motion.div>
  );
};

// ============================================================================
// TOAST CONTAINER COMPONENT
// ============================================================================

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
  // Stack up to 3 toasts
  const visibleToasts = toasts.slice(-3);

  return (
    <>
      <style>{toastKeyframes}</style>
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
        <AnimatePresence>
          {visibleToasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
          ))}
        </AnimatePresence>
      </div>
    </>
  );
};

// ============================================================================
// TOAST PROVIDER
// ============================================================================

interface ToastProviderProps {
  children: React.ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((type: ToastType, message: string, duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message, duration }]);
  }, []);

  const success = useCallback((message: string) => addToast('success', message), [addToast]);
  const error = useCallback((message: string) => addToast('error', message), [addToast]);
  const warning = useCallback((message: string) => addToast('warning', message), [addToast]);
  const info = useCallback((message: string) => addToast('info', message), [addToast]);

  return (
    <ToastContext.Provider value={{ success, error, warning, info }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export default ToastProvider;
