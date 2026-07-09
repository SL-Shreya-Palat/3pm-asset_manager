import { toast } from 'sonner';

export const showSuccessToast = (
  message: string,
  options?: {
    id?: string | number;
    duration?: number;
  },
) => {
  toast.success(message, {
    id: options?.id,
    duration: options?.duration ?? 3000,
    richColors: true,
    closeButton: false,
  });
};

export const showErrorToast = (
  message: string,
  options?: {
    id?: string | number;
    duration?: number;
  },
) => {
  toast.error(message, {
    id: options?.id,
    richColors: true,
    duration: options?.duration ?? 8000,
    closeButton: true,
  });
};
