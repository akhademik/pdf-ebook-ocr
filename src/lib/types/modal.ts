export type DialogVariant = 'info' | 'success' | 'warning' | 'error' | 'confirm';

export interface DialogOptions {
  isOpen: boolean;
  variant: DialogVariant;
  title: string;
  message: string;
  bullets?: string[];
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
}
