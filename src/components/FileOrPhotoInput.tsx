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
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex gap-2">
      {/* File / gallery picker */}
      <label className="flex-1 flex items-center gap-3 p-3 border border-dashed rounded-xl cursor-pointer hover:bg-secondary/50 transition-colors">
        {file ? (
          <>
            <FileText className="w-5 h-5 text-primary shrink-0" />
            <span className="text-sm truncate">{file.name}</span>
          </>
        ) : (
          <>
            <Upload className="w-5 h-5 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">{t('esek.upload.placeholder')}</span>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        />
      </label>

      {/* Camera capture button */}
      <button
        type="button"
        onClick={() => cameraRef.current?.click()}
        className="flex items-center justify-center w-12 border border-dashed rounded-xl text-muted-foreground hover:bg-secondary/50 hover:text-primary transition-colors shrink-0"
        title={t('upload.camera')}
      >
        <Camera className="w-5 h-5" />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        />
      </button>
    </div>
  );
};

export default FileOrPhotoInput;
