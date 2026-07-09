'use client';

import { Camera } from 'lucide-react';
import { Button, LoadingButton } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { PageBackButton } from '@/components/ui/page-back-button';
import type { BaseFormProps } from './base-form.types';

export type { BaseFormProps, BaseFormSection } from './base-form.types';

export function BaseForm({
  title,
  subtitle,
  onBack,
  onSubmit,
  saving,
  submitLabel,
  fileInputRef,
  onPhotoChange,
  photoPreview,
  photoAlt = 'Photo',
  nameFields,
  sections,
  error,
  children,
}: BaseFormProps) {
  return (
    <>
      <div className="p-6 w-full">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <PageBackButton onClick={onBack} className="mt-0.5" />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
        </div>

        <form onSubmit={onSubmit}>
          {/* Photo + Name Card */}
          <div className="rounded-sm border bg-card p-5 shadow-sm mb-6">
            <div className="flex items-center gap-4">
              {/* Round photo upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onPhotoChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-border bg-muted/50 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors overflow-hidden"
              >
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt={photoAlt}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Camera className="h-6 w-6 text-muted-foreground" />
                )}
              </button>

              {/* Name fields slot */}
              <div className="flex-1">{nameFields}</div>
            </div>
          </div>

          {/* Two-column section grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {sections.map((section) => (
              <div
                key={section.title}
                className="rounded-sm border bg-card p-5 shadow-sm"
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-foreground">
                    {section.title}
                  </h2>
                  {section.headerRight}
                </div>
                <Separator className="mb-4" />
                {section.children}
              </div>
            ))}
          </div>

          {/* Error banner */}
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 mb-4">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={onBack} disabled={saving}>
              Cancel
            </Button>
            <LoadingButton type="submit" loading={saving}>
              {submitLabel}
            </LoadingButton>
          </div>
        </form>
      </div>

      {/* Extra content outside form (e.g. dialogs) */}
      {children}
    </>
  );
}
