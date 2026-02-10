import React from 'react';

interface ModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
  type?: 'alert' | 'confirm';
}

export const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  title, 
  message, 
  onConfirm, 
  onCancel, 
  confirmText = 'OK', 
  cancelText = 'Cancel', 
  type = 'confirm' 
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-dark-800 border border-gold-500/30 rounded-xl shadow-2xl max-w-sm w-full overflow-hidden transform transition-all scale-100">
        {/* Header decoration */}
        <div className="h-1 w-full bg-gradient-to-r from-dark-800 via-gold-500 to-dark-800"></div>
        
        <div className="p-8 text-center">
          {type === 'confirm' && (
            <div className="mb-4 w-12 h-12 rounded-full bg-gold-500/10 flex items-center justify-center mx-auto text-gold-500">
              <i className="fa-solid fa-question text-xl"></i>
            </div>
          )}
          {type === 'alert' && (
             <div className="mb-4 w-12 h-12 rounded-full bg-gold-500/10 flex items-center justify-center mx-auto text-gold-500">
               <i className="fa-solid fa-info text-xl"></i>
             </div>
          )}

          <h3 className="text-xl font-display font-bold text-white mb-3">{title}</h3>
          <p className="text-gray-400 mb-8 text-sm leading-relaxed">{message}</p>
          
          <div className="flex gap-3 justify-center">
            {type === 'confirm' && onCancel && (
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-3 rounded-lg border border-gray-600 text-gray-300 hover:bg-dark-700 hover:text-white transition-colors text-xs font-bold uppercase tracking-wider"
              >
                {cancelText}
              </button>
            )}
            <button
              onClick={onConfirm}
              className={`px-4 py-3 rounded-lg bg-gold-500 text-black hover:bg-gold-400 transition-colors text-xs font-bold uppercase tracking-wider shadow-lg shadow-gold-500/20 ${type === 'confirm' ? 'flex-1' : 'w-full'}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};