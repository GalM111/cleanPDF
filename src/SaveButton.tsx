import { useState } from 'react';
import { savesViaShareSheet, shareFile } from './save';

interface Props {
  file: File;
  /** Object URL of the same file, for the download link. */
  url: string;
}

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

/**
 * Computer: a plain download link (unchanged behaviour).
 * Phone/tablet: opens the share sheet so the file can be saved to Files or
 * sent; if that is not possible, falls back to the download link.
 */
export function SaveButton({ file, url }: Props) {
  const [share, setShare] = useState(() => savesViaShareSheet(file));
  const [note, setNote] = useState('');
  const size = sizeLabel(file.size);

  if (!share) {
    return (
      <>
        <a className="primary" href={url} download={file.name}>
          Download {file.name} ({Math.round(file.size / 1024)} KB)
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
      setNote('Sharing did not open. Use the download link instead.');
    }
  };

  return (
    <>
      <button type="button" className="primary" onClick={onClick}>
        Save / Share {file.name} ({size})
      </button>
      <p className="hint">
        Choose <b>Save to Files</b> to keep it on your phone, or pick an app to send it.
      </p>
      {note && <p className="hint">{note}</p>}
    </>
  );
}
