import { useRef } from 'react';
import { Upload, FileText, Camera } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

interface FileOrPhotoInputProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  accept?: string;
}

const FileOrPhotoInput = ({ file, onFileChange, accept = 'image/*,.pdf' }: FileOrPhotoInputProps) => {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <label className="flex items-center gap-3 p-3 border border-dashed rounded-xl cursor-pointer hover:bg-secondary/50 transition-colors">
      {file ? (
        <>
          <FileText className="w-5 h-5 text-primary shrink-0" />
          <span className="text-sm truncate flex-1">{file.name}</span>
        </>
      ) : (
        <>
          <div className="flex items-center gap-1.5 shrink-0">
            <Camera className="w-5 h-5 text-muted-foreground" />
            <span className="text-muted-foreground">/</span>
            <Upload className="w-5 h-5 text-muted-foreground" />
          </div>
          <span className="text-sm text-muted-foreground">{t('upload.photoOrFile')}</span>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
      />
    </label>
  );
};

export default FileOrPhotoInput;
