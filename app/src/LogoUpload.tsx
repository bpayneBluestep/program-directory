/* =====================================================================
   LogoUpload.tsx — current logo preview + an upload/replace/remove control.
   Reads the chosen image to RAW base64 and calls uploadLogo immediately
   (logo changes save on their own, separate from the profile Save button).
   ===================================================================== */

import { useRef, useState } from 'react';
import { apiUploadLogo, fileToBase64, LoggedOutError } from './api';
import { Icon, useToast } from './ui';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — a listing logo never needs more.

interface Props {
  programId: string;
  logoUrl: string;
  programName: string;
  onLogoChange: (logoUrl: string) => void;
  onLoggedOut: () => void;
}

export default function LogoUpload({ programId, logoUrl, programName, onLogoChange, onLoggedOut }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.push('error', 'Choose an image file (PNG, JPG, or SVG).');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.push('error', 'That image is over 5 MB. Try a smaller file.');
      return;
    }
    setBusy(true);
    try {
      const b64 = await fileToBase64(file);
      const { logoUrl: nextUrl } = await apiUploadLogo(programId, b64, file.name, file.type);
      onLogoChange(nextUrl || '');
      toast.push('success', 'Logo updated.');
    } catch (err) {
      if (err instanceof LoggedOutError) {
        onLoggedOut();
        return;
      }
      toast.push('error', err instanceof Error ? err.message : 'Could not upload the logo.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function removeLogo() {
    setBusy(true);
    try {
      const { logoUrl: nextUrl } = await apiUploadLogo(programId, '');
      onLogoChange(nextUrl || '');
      toast.push('success', 'Logo removed.');
    } catch (err) {
      if (err instanceof LoggedOutError) {
        onLoggedOut();
        return;
      }
      toast.push('error', err instanceof Error ? err.message : 'Could not remove the logo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="logo-upload">
      <div className={`logo-frame${logoUrl ? '' : ' logo-frame-empty'}`}>
        {logoUrl ? (
          <img src={logoUrl} alt={`${programName || 'Program'} logo`} />
        ) : (
          <span className="logo-placeholder" aria-hidden="true">
            {(programName || 'P').trim().charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      <div className="logo-controls">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files && e.target.files[0];
            if (file) handleFile(file);
          }}
          disabled={busy}
        />
        <button
          type="button"
          className="btn btn-soft"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          <Icon name="upload" size={16} />
          {busy ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Upload logo'}
        </button>
        {logoUrl ? (
          <button type="button" className="btn btn-ghost" onClick={removeLogo} disabled={busy}>
            Remove
          </button>
        ) : null}
        <p className="logo-hint">PNG, JPG, or SVG. Square images look best. Up to 5&nbsp;MB.</p>
      </div>
    </div>
  );
}
