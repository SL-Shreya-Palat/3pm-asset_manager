import { type ReactNode, type RefObject, type ChangeEvent, type FormEvent } from 'react';

export interface BaseFormSection {
  title: string;
  children: ReactNode;
  /** Optional content rendered to the right of the section title (e.g. a toggle button). */
  headerRight?: ReactNode;
}

export interface BaseFormProps {
  // Header
  title: string;
  subtitle: string;
  onBack: () => void;

  // Form submission
  onSubmit: (e: FormEvent) => void;
  saving: boolean;
  submitLabel: string;

  // Photo card
  fileInputRef: RefObject<HTMLInputElement | null>;
  onPhotoChange: (e: ChangeEvent<HTMLInputElement>) => void;
  photoPreview?: string | null;
  photoAlt?: string;
  nameFields: ReactNode;

  // Sections
  sections: BaseFormSection[];

  // Error
  error?: string;

  // Extra content rendered outside the <form> (e.g. AssetTypeDialog)
  children?: ReactNode;
}
