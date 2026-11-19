import { useState } from 'react';
import type { Strings } from './i18n';
import { savesViaShareSheet, shareFile } from './save';

interface Props {
  file: File;
  /** Object URL of the same file, for the download link. */
  url: string;
  t: Strings;
}

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;

/**
 * Computer: a plain download link (unchanged behaviour).
 * Phone/tablet: opens the share sheet so the file can be saved to Files or
 * sent; if that is not possible, falls back to the download link.
 */
export function SaveButton({ file, url, t }: Props) {
  const [share, setShare] = useState(() => savesViaShareSheet(file));
  const [note, setNote] = useState('');
  const size = sizeLabel(file.size);

  if (!share) {
    return (
      <>
        <a className="primary" href={url} download={file.name}>
          {t.download(file.name, Math.round(file.size / 1024))}
        </a>
        {note && <p className="hint">{note}</p>}
      </>
    );
  }

  const onClick = async () => {
    setNote('');
    const outcome = await shareFile(file);
    if (outcome === 'failed') {
      setShare(false);
      setNote(t.shareFailed);
    }
  };

  return (
    <>
      <button type="button" className="primary" onClick={onClick}>
        {t.saveShare(file.name, size)}
      </button>
      <p className="hint">{t.saveHint}</p>
      {note && <p className="hint">{note}</p>}
    </>
  );
}
